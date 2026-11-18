import type { AuthUser } from '../../../auth/auth-user';
import type { Alert } from '../../domain/alert-rules';
import type { LlmPort } from '../ports/llm.port';
import type { ToolClientFactory } from '../ports/tool-client.port';
import { MONITOR_SYSTEM } from './prompts';

export interface MonitoringReport {
  alerts: Alert[];
  summary: string;
  generatedAt: string;
  engine: { id: string; model: string };
}

/** Alert rules are cheap and deterministic, so they refresh often; the model summary is reused while the alerts are unchanged. */
const CACHE_MS = 10_000;

export class MonitoringAgent {
  private cache: { at: number; report: MonitoringReport } | null = null;
  private lastSummary: {
    signature: string;
    summary: string;
    engine: MonitoringReport['engine'];
  } | null = null;

  constructor(
    private readonly llm: LlmPort,
    private readonly tools: ToolClientFactory,
    private readonly now: () => number = Date.now,
  ) {}

  async check(actor: AuthUser, force = false): Promise<MonitoringReport> {
    if (!force && this.cache && this.now() - this.cache.at < CACHE_MS) {
      return this.cache.report;
    }

    const client = await this.tools.create({ scope: 'analytics', actor });
    try {
      const result = await client.callTool('get_alerts', {});
      if (result.isError) throw new Error(result.text);
      const facts = (
        result.structured as { facts: { alerts: Alert[]; generatedAt: string } }
      ).facts;

      const signature = JSON.stringify(
        facts.alerts.map((alert) => [alert.id, alert.severity, alert.detail]),
      );
      let summary: string;
      let engine: MonitoringReport['engine'];
      if (this.lastSummary?.signature === signature) {
        ({ summary, engine } = this.lastSummary);
      } else {
        const response = await this.llm.complete({
          purpose: 'monitor',
          system: MONITOR_SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `ALERTAS_JSON: ${JSON.stringify(facts.alerts)}`,
                },
              ],
            },
          ],
          maxTokens: 400,
        });
        summary = response.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join(' ')
          .trim();
        engine = { id: response.engine, model: response.model };
        this.lastSummary = { signature, summary, engine };
      }

      const report: MonitoringReport = {
        alerts: facts.alerts,
        summary,
        generatedAt: facts.generatedAt,
        engine,
      };
      this.cache = { at: this.now(), report };
      return report;
    } finally {
      await client.close();
    }
  }
}
