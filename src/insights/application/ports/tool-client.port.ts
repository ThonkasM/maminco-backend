import type { AuthUser } from '../../../auth/auth-user';
import type { LlmToolDef } from './llm.port';

export const TOOL_CLIENT_FACTORY = Symbol('TOOL_CLIENT_FACTORY');

export type ToolScope = 'analytics' | 'pos';

export interface ToolResult {
  text: string;
  structured?: unknown;
  isError: boolean;
}

export interface PendingAction {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface ToolClient {
  listTools(): Promise<LlmToolDef[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  pendingActions(): PendingAction[];
  close(): Promise<void>;
}

export interface ToolClientOptions {
  scope: ToolScope;
  actor: AuthUser;
  areaId?: string;
  allowDestructive?: boolean;
}

export interface ToolClientFactory {
  create(options: ToolClientOptions): Promise<ToolClient>;
}
