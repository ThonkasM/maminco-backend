import {
  LlmUnavailableError,
  type LlmPort,
  type LlmRequest,
  type LlmResponse,
} from '../../application/ports/llm.port';
import { isModelAllowed } from './model-policy';
import { LlmRegistry } from './llm-registry';
import { OpenAiCompatibleAdapter } from './openai-compatible.adapter';
import { StubLlmAdapter } from './stub.adapter';

const request: LlmRequest = {
  purpose: 'report',
  system: 'sys',
  maxTokens: 100,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hola' }] }],
};

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

function adapter(fetchImpl: typeof fetch, apiKey = 'k') {
  return new OpenAiCompatibleAdapter({
    id: 'opencode',
    label: 'OpenCode',
    baseUrl: 'https://example.test/go/',
    chatPath: '/openai/v1/chat/completions',
    apiKey,
    model: 'deepseek-v4.1-flash',
    timeoutMs: 1000,
    external: true,
    fetchImpl,
  });
}

describe('OpenAiCompatibleAdapter', () => {
  it('sends an OpenAI chat request with bearer auth and maps tool calls', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      json({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'c1',
                  function: {
                    name: 'get_sales_summary',
                    arguments: '{"from":"2026-11-01"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'deepseek-v4.1-flash',
      }),
    );
    const response = await adapter(fetchMock).complete({
      ...request,
      tools: [
        {
          name: 'get_sales_summary',
          description: 'd',
          inputSchema: { type: 'object' },
        },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/go/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer k',
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-v4.1-flash');
    expect(body.tools[0].function.name).toBe('get_sales_summary');
    expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
    expect(response.stopReason).toBe('tool_use');
    expect(response.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'get_sales_summary',
      input: { from: '2026-11-01' },
    });
  });

  it('requests JSON mode only when no tools are offered', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(json({ choices: [{ message: { content: '{}' } }] }));
    await adapter(fetchMock).complete({
      ...request,
      json: true,
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('fails fast without an API key', async () => {
    const fetchMock = jest.fn();
    await expect(
      adapter(fetchMock as unknown as typeof fetch, '').complete(request),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps auth and rate limit errors without retrying', async () => {
    const auth = jest
      .fn()
      .mockResolvedValue(new Response('no', { status: 401 }));
    await expect(
      adapter(auth as unknown as typeof fetch).complete(request),
    ).rejects.toThrow(/credenciales/);
    expect(auth).toHaveBeenCalledTimes(1);

    const limited = jest
      .fn()
      .mockResolvedValue(
        new Response('slow', { status: 429, headers: { 'retry-after': '12' } }),
      );
    await expect(
      adapter(limited as unknown as typeof fetch).complete(request),
    ).rejects.toMatchObject({
      retryAfterMs: 12_000,
    });
  });

  it('retries once on a server error', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(
        json({ choices: [{ message: { content: 'ok' } }] }),
      );
    const response = await adapter(fetchMock).complete(request);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.content[0]).toMatchObject({ text: 'ok' });
  });
});

describe('model policy', () => {
  it('allows the DeepSeek family and rejects training-contributor models', () => {
    expect(isModelAllowed('deepseek-v4.1-flash')).toBe(true);
    expect(isModelAllowed('gpt-5')).toBe(false);
    expect(isModelAllowed('deepseek-contributor-x')).toBe(false);
    expect(isModelAllowed('gpt-5', 'gpt-*')).toBe(true);
  });
});

describe('LlmRegistry', () => {
  const ok: LlmResponse = {
    stopReason: 'end_turn',
    content: [{ type: 'text', text: 'listo' }],
    usage: { inputTokens: 1, outputTokens: 1 },
    model: 'm',
    engine: 'a',
  };
  const fake = (
    id: string,
    complete: () => Promise<LlmResponse>,
    available = true,
  ): LlmPort => ({
    info: { id, label: id, model: 'm', external: true },
    complete,
    isAvailable: () => Promise.resolve(available),
  });

  it('uses the first healthy engine in order', async () => {
    const registry = new LlmRegistry(
      [
        fake('a', () => Promise.resolve(ok)),
        fake('b', () => Promise.reject(new Error('x'))),
      ],
      new StubLlmAdapter(),
    );
    expect((await registry.complete(request)).engine).toBe('a');
  });

  it('falls through to the next engine and finally to the local stub', async () => {
    const failing = () => Promise.reject(new LlmUnavailableError('down'));
    const registry = new LlmRegistry(
      [
        fake('a', failing),
        fake('b', () => Promise.resolve({ ...ok, engine: 'b' })),
      ],
      new StubLlmAdapter(),
    );
    expect((await registry.complete(request)).engine).toBe('b');

    const allDown = new LlmRegistry([fake('a', failing)], new StubLlmAdapter());
    expect(
      (await allDown.complete({ ...request, purpose: 'monitor' })).engine,
    ).toBe('local');
  });

  it('skips unavailable engines and opens the circuit after repeated failures', async () => {
    let now = 0;
    const complete = jest
      .fn()
      .mockRejectedValue(new LlmUnavailableError('down'));
    const registry = new LlmRegistry(
      [fake('a', complete)],
      new StubLlmAdapter(),
      () => now,
    );

    for (let i = 0; i < 3; i++)
      await registry.complete({ ...request, purpose: 'monitor' });
    expect(complete).toHaveBeenCalledTimes(3);

    await registry.complete({ ...request, purpose: 'monitor' });
    expect(complete).toHaveBeenCalledTimes(3);

    now = 61_000;
    await registry.complete({ ...request, purpose: 'monitor' });
    expect(complete).toHaveBeenCalledTimes(4);

    const skipped = new LlmRegistry(
      [fake('b', complete, false)],
      new StubLlmAdapter(),
    );
    await skipped.complete({ ...request, purpose: 'monitor' });
    expect(complete).toHaveBeenCalledTimes(4);
  });

  it('reports engine status including the fallback', async () => {
    const registry = new LlmRegistry(
      [fake('a', () => Promise.resolve(ok), false)],
      new StubLlmAdapter(),
    );
    const status = await registry.status();
    expect(status.map((s) => [s.id, s.available])).toEqual([
      ['a', false],
      ['local', true],
    ]);
  });
});
