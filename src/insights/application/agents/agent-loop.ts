import type {
  LlmContentBlock,
  LlmMessage,
  LlmPort,
  LlmPurpose,
  LlmToolDef,
} from '../ports/llm.port';
import type { ToolClient, ToolResult } from '../ports/tool-client.port';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: ToolResult;
  ms: number;
}

export interface AgentRunOptions {
  purpose: LlmPurpose;
  system: string;
  userMessage: string;
  tools: LlmToolDef[];
  client: ToolClient;
  maxSteps?: number;
  maxToolCalls?: number;
  maxTokens?: number;
  sequential?: boolean;
  json?: boolean;
}

export interface AgentRunResult {
  finalText: string;
  toolCalls: ToolCallRecord[];
  steps: number;
  model: string;
  engine: string;
  usage: { inputTokens: number; outputTokens: number };
}

const MAX_RESULT_CHARS = 9000;
const TOOL_TIMEOUT_MS = 20_000;

function stableKey(name: string, args: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(args).sort(([a], [b]) => a.localeCompare(b)),
  );
  return `${name}:${JSON.stringify(sorted)}`;
}

function wrapToolData(name: string, text: string): string {
  const body =
    text.length > MAX_RESULT_CHARS
      ? `${text.slice(0, MAX_RESULT_CHARS)}…[recortado]`
      : text;
  return `<tool_data tool="${name}">${body}</tool_data>`;
}

function textOf(blocks: LlmContentBlock[]): string {
  return blocks
    .filter(
      (block): block is Extract<LlmContentBlock, { type: 'text' }> =>
        block.type === 'text',
    )
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: tiempo de espera agotado`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export class AgentLoop {
  constructor(private readonly llm: LlmPort) {}

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const maxSteps = options.maxSteps ?? 6;
    const maxToolCalls = options.maxToolCalls ?? 12;
    const messages: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: options.userMessage }] },
    ];
    const records: ToolCallRecord[] = [];
    const cache = new Map<string, ToolCallRecord>();
    const usage = { inputTokens: 0, outputTokens: 0 };
    let model = this.llm.info.model;
    let engine = this.llm.info.id;
    let finalText = '';
    let steps = 0;

    while (steps < maxSteps) {
      steps++;
      const lastStep = steps === maxSteps || records.length >= maxToolCalls;
      const response = await this.llm.complete({
        purpose: options.purpose,
        system: options.system,
        messages,
        tools: lastStep ? undefined : options.tools,
        maxTokens: options.maxTokens ?? 2000,
        json: options.json,
      });
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
      model = response.model;
      engine = response.engine;
      messages.push({ role: 'assistant', content: response.content });

      const calls = response.content.filter(
        (block): block is Extract<LlmContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use',
      );
      if (response.stopReason !== 'tool_use' || calls.length === 0) {
        finalText = textOf(response.content);
        break;
      }

      const execute = async (
        call: (typeof calls)[number],
      ): Promise<ToolCallRecord> => {
        const key = stableKey(call.name, call.input);
        const cached = cache.get(key);
        if (cached && options.purpose !== 'voice') {
          return { ...cached, id: call.id };
        }
        const started = Date.now();
        let result: ToolResult;
        try {
          result = await withTimeout(
            options.client.callTool(call.name, call.input),
            TOOL_TIMEOUT_MS,
            call.name,
          );
        } catch (error) {
          result = {
            text: error instanceof Error ? error.message : 'Error desconocido',
            isError: true,
          };
        }
        const record = {
          id: call.id,
          name: call.name,
          args: call.input,
          result,
          ms: Date.now() - started,
        };
        cache.set(key, record);
        return record;
      };

      const executed: ToolCallRecord[] = [];
      if (options.sequential) {
        for (const call of calls) executed.push(await execute(call));
      } else {
        executed.push(...(await Promise.all(calls.map(execute))));
      }
      records.push(...executed);

      messages.push({
        role: 'user',
        content: executed.map((record) => ({
          type: 'tool_result' as const,
          toolUseId: record.id,
          content: wrapToolData(record.name, record.result.text),
          isError: record.result.isError,
        })),
      });
    }

    return { finalText, toolCalls: records, steps, model, engine, usage };
  }
}
