export const LLM_PORT = Symbol('LLM_PORT');

export type LlmContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContentBlock[];
}

export interface LlmToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type LlmPurpose = 'report' | 'monitor' | 'voice';

export interface LlmRequest {
  purpose: LlmPurpose;
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  maxTokens: number;
  json?: boolean;
}

export interface LlmResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  content: LlmContentBlock[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  engine: string;
}

export interface LlmEngineInfo {
  id: string;
  label: string;
  model: string;
  external: boolean;
}

export interface LlmPort {
  readonly info: LlmEngineInfo;
  complete(request: LlmRequest): Promise<LlmResponse>;
  isAvailable(): Promise<boolean>;
}

export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}
