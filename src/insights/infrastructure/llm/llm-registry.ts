import {
  LlmUnavailableError,
  type LlmEngineInfo,
  type LlmPort,
  type LlmRequest,
  type LlmResponse,
} from '../../application/ports/llm.port';

interface BreakerState {
  failures: number;
  openUntil: number;
}

export interface EngineStatus extends LlmEngineInfo {
  available: boolean;
  circuitOpen: boolean;
}

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 60_000;

export class LlmRegistry implements LlmPort {
  private readonly breakers = new Map<string, BreakerState>();

  constructor(
    private readonly engines: LlmPort[],
    private readonly fallback: LlmPort,
    private readonly now: () => number = Date.now,
  ) {}

  get info(): LlmEngineInfo {
    return this.engines[0]?.info ?? this.fallback.info;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async status(): Promise<EngineStatus[]> {
    const all = [...this.engines, this.fallback];
    return Promise.all(
      all.map(async (engine) => ({
        ...engine.info,
        available: await engine.isAvailable(),
        circuitOpen: this.isOpen(engine.info.id),
      })),
    );
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    for (const engine of this.engines) {
      if (this.isOpen(engine.info.id) || !(await engine.isAvailable()))
        continue;
      try {
        const response = await engine.complete(request);
        this.breakers.delete(engine.info.id);
        return response;
      } catch (error) {
        this.recordFailure(engine.info.id, error);
        if (!(error instanceof LlmUnavailableError)) throw error;
      }
    }
    return this.fallback.complete(request);
  }

  private isOpen(id: string): boolean {
    const state = this.breakers.get(id);
    return Boolean(state && state.openUntil > this.now());
  }

  private recordFailure(id: string, error: unknown): void {
    const state = this.breakers.get(id) ?? { failures: 0, openUntil: 0 };
    state.failures += 1;
    const retryAfter =
      error instanceof LlmUnavailableError ? error.retryAfterMs : undefined;
    if (retryAfter) {
      state.openUntil =
        this.now() + Math.min(Math.max(retryAfter, 30_000), 300_000);
    } else if (state.failures >= FAILURE_THRESHOLD) {
      state.openUntil = this.now() + OPEN_MS;
      state.failures = 0;
    }
    this.breakers.set(id, state);
  }
}
