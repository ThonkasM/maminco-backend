import { randomUUID } from 'crypto';
import type { AuthUser } from '../../../auth/auth-user';
import type { LlmPort } from '../ports/llm.port';
import type {
  PendingAction,
  ToolClientFactory,
} from '../ports/tool-client.port';
import { AgentLoop, type ToolCallRecord } from './agent-loop';
import { VOICE_SYSTEM } from './prompts';

export type VoiceStatus = 'done' | 'needs_confirmation' | 'clarify' | 'error';

export interface VoiceAction {
  tool: string;
  summary: string;
  ok: boolean;
}

export interface VoiceResult {
  status: VoiceStatus;
  message: string;
  actions: VoiceAction[];
  tableNumbers: number[];
  confirmation?: { token: string; summaries: string[] };
  engine: { id: string; model: string };
}

export interface VoiceInput {
  transcript: string;
  tableNumber?: number;
  areaId?: string;
  actor: AuthUser;
}

const WRITE_TOOLS = new Set([
  'open_table_order',
  'add_item',
  'set_item_quantity',
  'remove_item',
]);
const PENDING_TTL_MS = 2 * 60_000;

interface Stored {
  actorId: string;
  areaId?: string;
  actions: PendingAction[];
  expires: number;
}

function toAction(call: ToolCallRecord): VoiceAction {
  const payload = (call.result.structured ?? {}) as {
    summary?: string;
    pending?: boolean;
  };
  return {
    tool: call.name,
    summary: payload.summary ?? call.result.text,
    ok: !call.result.isError && !payload.pending,
  };
}

export class PendingConfirmations {
  private readonly items = new Map<string, Stored>();

  constructor(private readonly now: () => number = Date.now) {}

  save(actorId: string, actions: PendingAction[], areaId?: string): string {
    this.purge();
    const token = randomUUID();
    this.items.set(token, {
      actorId,
      areaId,
      actions,
      expires: this.now() + PENDING_TTL_MS,
    });
    return token;
  }

  take(token: string, actorId: string): Stored | null {
    this.purge();
    const found = this.items.get(token);
    if (!found || found.actorId !== actorId) return null;
    this.items.delete(token);
    return found;
  }

  private purge(): void {
    for (const [token, stored] of this.items) {
      if (stored.expires <= this.now()) this.items.delete(token);
    }
  }
}

export class VoiceAgent {
  constructor(
    private readonly llm: LlmPort,
    private readonly tools: ToolClientFactory,
    private readonly confirmations: PendingConfirmations,
  ) {}

  async run(input: VoiceInput): Promise<VoiceResult> {
    const client = await this.tools.create({
      scope: 'pos',
      actor: input.actor,
      areaId: input.areaId,
      allowDestructive: false,
    });
    try {
      const run = await new AgentLoop(this.llm).run({
        purpose: 'voice',
        system: VOICE_SYSTEM,
        userMessage: `TRANSCRIPCION: ${input.transcript}\nMESA_CONTEXTO: ${input.tableNumber ?? ''}`,
        tools: await client.listTools(),
        client,
        sequential: true,
        maxSteps: 5,
        maxToolCalls: 14,
        maxTokens: 1500,
      });

      const writes = run.toolCalls.filter((call) => WRITE_TOOLS.has(call.name));
      const actions = writes.map(toAction);
      const pending = client.pendingActions();
      const tableNumbers = [
        ...new Set(
          writes
            .map((call) => Number(call.args.tableNumber))
            .filter((n) => Number.isFinite(n)),
        ),
      ];
      const engine = { id: run.engine, model: run.model };
      const executed = actions.filter((a) => a.ok);

      if (pending.length > 0) {
        const summaries = pending.map((p) => p.summary);
        return {
          status: 'needs_confirmation',
          message: this.confirmationMessage(run.finalText, summaries),
          actions: executed,
          tableNumbers,
          confirmation: {
            token: this.confirmations.save(
              input.actor.sub,
              pending,
              input.areaId,
            ),
            summaries,
          },
          engine,
        };
      }
      if (writes.length === 0) {
        return {
          status: 'clarify',
          message: run.finalText || 'No entendí la orden.',
          actions: [],
          tableNumbers,
          engine,
        };
      }
      return {
        status: executed.length > 0 ? 'done' : 'error',
        message: run.finalText || actions.map((a) => a.summary).join('. '),
        actions,
        tableNumbers,
        engine,
      };
    } finally {
      await client.close();
    }
  }

  private confirmationMessage(text: string, summaries: string[]): string {
    const ask = `Confirma para: ${summaries.join('; ')}.`;
    const repeated = summaries.some((summary) => text.includes(summary));
    return repeated || !text ? ask : `${text} ${ask}`;
  }

  async confirm(token: string, actor: AuthUser): Promise<VoiceResult> {
    const stored = this.confirmations.take(token, actor.sub);
    if (!stored) {
      return {
        status: 'error',
        message: 'La confirmación venció. Repite la orden.',
        actions: [],
        tableNumbers: [],
        engine: { id: this.llm.info.id, model: this.llm.info.model },
      };
    }
    const client = await this.tools.create({
      scope: 'pos',
      actor,
      areaId: stored.areaId,
      allowDestructive: true,
    });
    try {
      const actions: VoiceAction[] = [];
      for (const action of stored.actions) {
        const result = await client.callTool(action.tool, action.args);
        const payload = (result.structured ?? {}) as { summary?: string };
        actions.push({
          tool: action.tool,
          summary: payload.summary ?? result.text,
          ok: !result.isError,
        });
      }
      const tableNumbers = [
        ...new Set(
          stored.actions
            .map((a) => Number(a.args.tableNumber))
            .filter((n) => Number.isFinite(n)),
        ),
      ];
      return {
        status: actions.every((a) => a.ok) ? 'done' : 'error',
        message: actions.map((a) => a.summary).join('. '),
        actions,
        tableNumbers,
        engine: { id: this.llm.info.id, model: this.llm.info.model },
      };
    } finally {
      await client.close();
    }
  }
}
