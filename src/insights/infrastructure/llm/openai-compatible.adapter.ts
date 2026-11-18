import {
  LlmUnavailableError,
  type LlmContentBlock,
  type LlmEngineInfo,
  type LlmMessage,
  type LlmPort,
  type LlmRequest,
  type LlmResponse,
} from '../../application/ports/llm.port';

export interface OpenAiCompatibleOptions {
  id: string;
  label: string;
  baseUrl: string;
  chatPath: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  external: boolean;
  userAgent?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

interface ChatCompletion {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function?: { name?: string; arguments?: unknown };
      }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

const RETRIES = 1;

function toChatMessages(system: string, messages: LlmMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (message.role === 'assistant') {
      const text = message.content
        .filter(
          (b): b is Extract<LlmContentBlock, { type: 'text' }> =>
            b.type === 'text',
        )
        .map((b) => b.text)
        .join('\n');
      const calls = message.content.filter(
        (b): b is Extract<LlmContentBlock, { type: 'tool_use' }> =>
          b.type === 'tool_use',
      );
      out.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length > 0
          ? {
              tool_calls: calls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.input),
                },
              })),
            }
          : {}),
      });
      continue;
    }
    const results = message.content.filter(
      (b): b is Extract<LlmContentBlock, { type: 'tool_result' }> =>
        b.type === 'tool_result',
    );
    for (const result of results) {
      out.push({
        role: 'tool',
        tool_call_id: result.toolUseId,
        content: result.content,
      });
    }
    const text = message.content
      .filter(
        (b): b is Extract<LlmContentBlock, { type: 'text' }> =>
          b.type === 'text',
      )
      .map((b) => b.text)
      .join('\n');
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export class OpenAiCompatibleAdapter implements LlmPort {
  readonly info: LlmEngineInfo;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.info = {
      id: options.id,
      label: options.label,
      model: options.model,
      external: options.external,
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(Boolean(this.options.apiKey));
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!this.options.apiKey) {
      throw new LlmUnavailableError(
        `${this.options.label}: falta la clave de API`,
      );
    }

    const tools = request.tools?.length
      ? request.tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }))
      : undefined;

    const body = {
      model: this.options.model,
      stream: false,
      max_tokens: Math.max(request.maxTokens, 1024),
      messages: toChatMessages(request.system, request.messages),
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
      ...(request.json && !tools
        ? { response_format: { type: 'json_object' } }
        : {}),
    };

    const url = `${this.options.baseUrl.replace(/\/+$/, '')}${this.options.chatPath}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.options.userAgent
        ? { 'User-Agent': this.options.userAgent }
        : {}),
      ...this.options.headers,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });

        if (response.status === 401 || response.status === 403) {
          throw new LlmUnavailableError(
            `${this.options.label}: credenciales rechazadas`,
            300_000,
          );
        }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after')) || 30;
          throw new LlmUnavailableError(
            `${this.options.label}: límite de uso alcanzado`,
            retryAfter * 1000,
          );
        }
        if (response.status >= 500) {
          lastError = new LlmUnavailableError(
            `${this.options.label}: error ${response.status}`,
          );
          if (attempt < RETRIES) {
            await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
            continue;
          }
          throw lastError;
        }
        if (!response.ok) {
          throw new LlmUnavailableError(
            `${this.options.label}: respuesta ${response.status}`,
          );
        }

        return this.map((await response.json()) as ChatCompletion);
      } catch (error) {
        if (error instanceof LlmUnavailableError) throw error;
        lastError = error;
        if (attempt < RETRIES) {
          await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
          continue;
        }
      }
    }
    throw new LlmUnavailableError(
      `${this.options.label}: ${lastError instanceof Error ? lastError.message : 'sin respuesta'}`,
    );
  }

  private map(payload: ChatCompletion): LlmResponse {
    const choice = payload.choices?.[0];
    const message = choice?.message;
    const content: LlmContentBlock[] = [];
    if (message?.content) content.push({ type: 'text', text: message.content });

    const calls = message?.tool_calls ?? [];
    calls.forEach((call, index) => {
      if (!call.function?.name) return;
      content.push({
        type: 'tool_use',
        id: call.id ?? `call_${index}`,
        name: call.function.name,
        input: parseArguments(call.function.arguments),
      });
    });

    const hasTools = content.some((block) => block.type === 'tool_use');
    return {
      stopReason: hasTools
        ? 'tool_use'
        : choice?.finish_reason === 'length'
          ? 'max_tokens'
          : 'end_turn',
      content,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
      model: payload.model ?? this.options.model,
      engine: this.options.id,
    };
  }
}
