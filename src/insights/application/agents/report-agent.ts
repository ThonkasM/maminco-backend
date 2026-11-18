import { z } from 'zod';
import type { AuthUser } from '../../../auth/auth-user';
import {
  autoChartIntent,
  buildChartSpec,
  type ChartSpec,
  type ChartType,
} from '../../domain/chart-spec';
import type { Dataset } from '../../domain/dataset';
import {
  parseComparisonRanges,
  parseQuestionRange,
} from '../../domain/question-range';
import type { LlmPort } from '../ports/llm.port';
import type { ToolClientFactory } from '../ports/tool-client.port';
import { AgentLoop } from './agent-loop';
import { extractJson } from './json';
import { REPORT_SYSTEM } from './prompts';

export interface AskInput {
  question: string;
  from?: string;
  to?: string;
  areaId?: string;
  actor: AuthUser;
}

export interface AskResult {
  question: string;
  answer: string;
  charts: ChartSpec[];
  datasets: Dataset[];
  followUps: string[];
  toolsUsed: string[];
  range: { from: string; to: string; label: string };
  engine: { id: string; model: string };
  steps: number;
  ms: number;
}

const finalShape = z.object({
  answer: z.string().min(1),
  charts: z
    .array(
      z.object({
        dataset: z.string().optional(),
        type: z.enum(['line', 'area', 'bar', 'pie', 'combo']).optional(),
        x: z.string().optional(),
        y: z.array(z.string()).optional(),
        title: z.string().optional(),
      }),
    )
    .optional(),
  followUps: z.array(z.string()).optional(),
});

export class ReportAgent {
  constructor(
    private readonly llm: LlmPort,
    private readonly tools: ToolClientFactory,
    private readonly today: () => string,
  ) {}

  async ask(input: AskInput): Promise<AskResult> {
    const started = Date.now();
    const today = this.today();
    const range = input.from
      ? {
          from: input.from,
          to: input.to ?? input.from,
          label: `${input.from} a ${input.to ?? input.from}`,
        }
      : parseQuestionRange(input.question, today);

    const comparison = input.from
      ? null
      : parseComparisonRanges(input.question, today);
    const comparisonLine = comparison
      ? `\nCOMPARAR_CON: from=${comparison.previous.from} to=${comparison.previous.to} (${comparison.previous.label})`
      : '';

    const client = await this.tools.create({
      scope: 'analytics',
      actor: input.actor,
      areaId: input.areaId,
    });
    try {
      const run = await new AgentLoop(this.llm).run({
        purpose: 'report',
        system: REPORT_SYSTEM(today),
        userMessage: `HOY: ${today}\nRANGO_SUGERIDO: from=${range.from} to=${range.to} (${range.label})${comparisonLine}\nPREGUNTA: ${input.question}`,
        tools: await client.listTools(),
        client,
        maxSteps: 5,
        maxToolCalls: 8,
        maxTokens: 2500,
      });

      const datasets = new Map<string, Dataset>();
      for (const call of run.toolCalls) {
        if (call.result.isError) continue;
        const payload = call.result.structured as
          { datasets?: Dataset[] } | undefined;
        for (const dataset of payload?.datasets ?? [])
          datasets.set(dataset.id, dataset);
      }

      const parsed = finalShape.safeParse(extractJson(run.finalText));
      const answer = parsed.success
        ? parsed.data.answer
        : run.finalText ||
          'No pude generar una respuesta con los datos disponibles.';

      const charts: ChartSpec[] = [];
      const addChart = (spec: ChartSpec | null) => {
        if (spec && !charts.some((c) => c.id === spec.id)) charts.push(spec);
      };

      for (const intent of parsed.success ? (parsed.data.charts ?? []) : []) {
        const dataset =
          (intent.dataset && datasets.get(intent.dataset)) ||
          [...datasets.values()][0];
        if (!dataset) continue;
        const auto = autoChartIntent(dataset);
        const type: ChartType | undefined = intent.type ?? auto?.type;
        const x = intent.x ?? auto?.x;
        const y = intent.y?.length ? intent.y : auto?.y;
        if (!type || !x || !y) continue;
        addChart(
          buildChartSpec(dataset, {
            dataset: dataset.id,
            type,
            x,
            y,
            title: intent.title,
          }),
        );
      }
      if (charts.length === 0) {
        for (const dataset of datasets.values()) {
          const auto = autoChartIntent(dataset);
          if (auto) addChart(buildChartSpec(dataset, auto));
          if (charts.length >= 2) break;
        }
      }

      return {
        question: input.question,
        answer,
        charts: charts.slice(0, 3),
        datasets: [...datasets.values()].map((d) => ({
          ...d,
          rows: d.rows.slice(0, 200),
        })),
        followUps: parsed.success
          ? (parsed.data.followUps ?? []).slice(0, 3)
          : [],
        toolsUsed: [...new Set(run.toolCalls.map((c) => c.name))],
        range,
        engine: { id: run.engine, model: run.model },
        steps: run.steps,
        ms: Date.now() - started,
      };
    } finally {
      await client.close();
    }
  }
}
