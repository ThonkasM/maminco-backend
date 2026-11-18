import type { AuthUser } from '../../../auth/auth-user';
import { StubLlmAdapter } from '../../infrastructure/llm/stub.adapter';
import type {
  PendingAction,
  ToolClient,
  ToolClientFactory,
  ToolClientOptions,
  ToolResult,
} from '../ports/tool-client.port';
import { MonitoringAgent } from './monitoring-agent';
import { ReportAgent } from './report-agent';
import { PendingConfirmations, VoiceAgent } from './voice-agent';

const actor = { sub: 'u1', id: 'u1', role: 'ADMINISTRATOR' } as AuthUser;

const ok = (payload: Record<string, unknown>): ToolResult => ({
  text: JSON.stringify(payload),
  structured: payload,
  isError: false,
});

class FakeClient implements ToolClient {
  calls: { name: string; args: Record<string, unknown> }[] = [];
  pending: PendingAction[] = [];
  constructor(
    private readonly handlers: Record<
      string,
      (args: Record<string, unknown>) => ToolResult
    >,
    private readonly allowDestructive = false,
  ) {}

  listTools() {
    return Promise.resolve(
      Object.keys(this.handlers).map((name) => ({
        name,
        description: name,
        inputSchema: { type: 'object' },
      })),
    );
  }

  callTool(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    const result = this.handlers[name]?.(args) ?? {
      text: 'desconocida',
      isError: true,
    };
    const payload = result.structured as
      { pendingSummary?: string } | undefined;
    if (payload?.pendingSummary && !this.allowDestructive) {
      this.pending.push({ tool: name, args, summary: payload.pendingSummary });
      return Promise.resolve(
        ok({ pending: true, summary: payload.pendingSummary }),
      );
    }
    return Promise.resolve(result);
  }

  pendingActions() {
    return this.pending;
  }

  close() {
    return Promise.resolve();
  }
}

function factoryOf(build: (options: ToolClientOptions) => FakeClient): {
  factory: ToolClientFactory;
  clients: FakeClient[];
} {
  const clients: FakeClient[] = [];
  return {
    clients,
    factory: {
      create: (options) => {
        const client = build(options);
        clients.push(client);
        return Promise.resolve(client);
      },
    },
  };
}

describe('ReportAgent (local engine)', () => {
  const series = {
    datasets: [
      {
        id: 'sales_timeseries',
        title: 'Ventas por día',
        columns: [
          { name: 'period', label: 'Día', kind: 'time' },
          {
            name: 'totalSales',
            label: 'Ventas',
            kind: 'number',
            format: 'currency',
          },
          {
            name: 'totalOrders',
            label: 'Órdenes',
            kind: 'number',
            format: 'integer',
          },
        ],
        rows: [
          { period: '2026-11-01', totalSales: 100, totalOrders: 4 },
          { period: '2026-11-02', totalSales: 300, totalOrders: 9 },
        ],
      },
    ],
    facts: {
      rangeLabel: 'x',
      best: { period: '2026-11-02', totalSales: 300 },
      worst: { period: '2026-11-01', totalSales: 100 },
      average: 200,
    },
  };

  it('plans tools from the question, composes the answer and builds a chart from tool data', async () => {
    const { factory, clients } = factoryOf(
      () =>
        new FakeClient({
          get_sales_timeseries: () => ok(series),
          get_sales_summary: () => ok({ datasets: [], facts: {} }),
        }),
    );
    const agent = new ReportAgent(
      new StubLlmAdapter(),
      factory,
      () => '2026-11-18',
    );
    const result = await agent.ask({
      question: 'tendencia de ventas por día esta semana',
      actor,
    });

    expect(clients[0].calls[0]).toMatchObject({
      name: 'get_sales_timeseries',
      args: { from: '2026-11-16', to: '2026-11-18' },
    });
    expect(result.answer).toContain('mejor día');
    expect(result.charts).toHaveLength(1);
    expect(result.charts[0].data).toHaveLength(2);
    expect(result.toolsUsed).toContain('get_sales_timeseries');
    expect(result.engine.id).toBe('local');
  });

  it('answers "¿en qué turno vendí más?" with a breakdown by shift and a pie chart', async () => {
    const { factory, clients } = factoryOf(
      () =>
        new FakeClient({
          get_breakdown: () =>
            ok({
              datasets: [
                {
                  id: 'breakdown_shift',
                  title: 'Ventas por turno',
                  columns: [
                    { name: 'label', label: 'Turno', kind: 'category' },
                    {
                      name: 'totalSales',
                      label: 'Ventas',
                      kind: 'number',
                      format: 'currency',
                    },
                  ],
                  rows: [
                    { label: 'Día', totalSales: 100 },
                    { label: 'Noche', totalSales: 300 },
                  ],
                },
              ],
              facts: {
                dimension: 'shift',
                leader: { label: 'Noche', totalSales: 300, share: 0.75 },
                total: 400,
              },
            }),
        }),
    );
    const agent = new ReportAgent(
      new StubLlmAdapter(),
      factory,
      () => '2026-11-18',
    );
    const result = await agent.ask({
      question: '¿En qué turno vendí más esta semana?',
      actor,
    });
    expect(clients[0].calls[0]).toMatchObject({
      name: 'get_breakdown',
      args: { by: 'shift' },
    });
    expect(result.answer).toContain('Noche');
    expect(result.charts[0].type).toBe('pie');
  });

  it('survives a failing tool without breaking the answer', async () => {
    const { factory } = factoryOf(
      () =>
        new FakeClient({
          get_sales_summary: () => ({ text: 'boom', isError: true }),
          get_sales_timeseries: () => ({ text: 'boom', isError: true }),
        }),
    );
    const agent = new ReportAgent(
      new StubLlmAdapter(),
      factory,
      () => '2026-11-18',
    );
    const result = await agent.ask({ question: 'cuánto vendí hoy', actor });
    expect(result.charts).toEqual([]);
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it('passes the comparison window to compare_periods', async () => {
    const { factory, clients } = factoryOf(
      () =>
        new FakeClient({
          compare_periods: () =>
            ok({
              datasets: [],
              facts: {
                deltas: { totalSales: 10 },
                current: { totalSales: 110 },
                previous: { totalSales: 100 },
              },
            }),
        }),
    );
    const agent = new ReportAgent(
      new StubLlmAdapter(),
      factory,
      () => '2026-11-18',
    );
    await agent.ask({ question: 'compara este mes con el mes pasado', actor });
    expect(clients[0].calls[0].args).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-18',
      compareFrom: '2026-10-01',
      compareTo: '2026-10-18',
    });
  });
});

describe('MonitoringAgent', () => {
  it('reads alerts through the tool client and caches for a few seconds', async () => {
    let now = 1000;
    const { factory, clients } = factoryOf(
      () =>
        new FakeClient({
          get_alerts: () =>
            ok({
              datasets: [],
              facts: {
                generatedAt: 'now',
                alerts: [
                  {
                    id: 'a',
                    severity: 'critical',
                    title: 'Ventas bajas',
                    detail: '',
                  },
                ],
              },
            }),
        }),
    );
    const agent = new MonitoringAgent(new StubLlmAdapter(), factory, () => now);
    const first = await agent.check(actor);
    expect(first.alerts).toHaveLength(1);
    expect(first.summary).toContain('crítica');

    await agent.check(actor);
    expect(clients).toHaveLength(1);
    now += 11_000;
    await agent.check(actor);
    expect(clients).toHaveLength(2);
    await agent.check(actor, true);
    expect(clients).toHaveLength(3);
  });
});

describe('VoiceAgent (local engine)', () => {
  const dishes = [
    { id: 'p-criollo', name: 'PATO CRIOLLO', price: 250, available: true },
    { id: 'p-gas', name: 'GASEOSA FAMILIAR', price: 25, available: true },
  ];

  const posHandlers = (state: {
    order: {
      items: { productId: string; quantity: number; name: string }[];
    } | null;
  }) => ({
    search_menu: (args: Record<string, unknown>) =>
      ok({
        datasets: [],
        facts: {
          query: args.query,
          matches: dishes
            .filter((d) =>
              String(args.query)
                .toLowerCase()
                .split(' ')
                .some((t) =>
                  d.name.toLowerCase().includes(t.replace(/s$/, '')),
                ),
            )
            .map((d) => ({ ...d, score: 1 })),
        },
      }),
    get_table_order: () => ok({ datasets: [], facts: { order: state.order } }),
    open_table_order: () => {
      state.order = { items: [] };
      return ok({ ok: true, summary: 'Abrí la mesa 40' });
    },
    add_item: (args: Record<string, unknown>) => {
      const dish = dishes.find((d) => d.id === args.productId)!;
      state.order?.items.push({
        productId: dish.id,
        quantity: Number(args.quantity),
        name: dish.name,
      });
      return ok({
        ok: true,
        summary: `Agregué ${String(args.quantity)}× ${dish.name} a la mesa 40`,
      });
    },
    remove_item: (args: Record<string, unknown>) =>
      ok({
        pendingSummary: `Quitar ${String(args.productId)} de la mesa 40`,
        ok: true,
        summary: 'Quité el producto',
      }),
  });

  it('opens the table and adds the dishes in order, one call at a time', async () => {
    const state = {
      order: null as {
        items: { productId: string; quantity: number; name: string }[];
      } | null,
    };
    const { factory, clients } = factoryOf(
      () => new FakeClient(posHandlers(state)),
    );
    const agent = new VoiceAgent(
      new StubLlmAdapter(),
      factory,
      new PendingConfirmations(),
    );
    const result = await agent.run({
      transcript:
        'Abre la mesa 40 y coloca 2 patos criollos y 1 gaseosa familiar',
      actor,
    });

    expect(result.status).toBe('done');
    expect(
      clients[0].calls
        .map((c) => c.name)
        .filter((n) => !['search_menu', 'get_table_order'].includes(n)),
    ).toEqual(['open_table_order', 'add_item', 'add_item']);
    expect(state.order?.items).toEqual([
      { productId: 'p-criollo', quantity: 2, name: 'PATO CRIOLLO' },
      { productId: 'p-gas', quantity: 1, name: 'GASEOSA FAMILIAR' },
    ]);
    expect(result.tableNumbers).toEqual([40]);
  });

  it('asks for the table when it is missing and does not call any tool', async () => {
    const { factory, clients } = factoryOf(() => new FakeClient({}));
    const agent = new VoiceAgent(
      new StubLlmAdapter(),
      factory,
      new PendingConfirmations(),
    );
    const result = await agent.run({ transcript: 'agrega una gaseosa', actor });
    expect(result.status).toBe('clarify');
    expect(clients[0].calls).toHaveLength(0);
  });

  it('holds destructive actions for confirmation, executes them once, and rejects reuse', async () => {
    const state = {
      order: {
        items: [{ productId: 'p-criollo', quantity: 2, name: 'PATO CRIOLLO' }],
      },
    };
    const confirmations = new PendingConfirmations();
    const built: FakeClient[] = [];
    const factory: ToolClientFactory = {
      create: (options) => {
        const client = new FakeClient(
          posHandlers(state),
          options.allowDestructive,
        );
        built.push(client);
        return Promise.resolve(client);
      },
    };
    const agent = new VoiceAgent(new StubLlmAdapter(), factory, confirmations);

    const first = await agent.run({
      transcript: 'quita el pato criollo de la mesa 40',
      actor,
    });
    expect(first.status).toBe('needs_confirmation');
    expect(first.confirmation?.summaries).toHaveLength(1);

    const token = first.confirmation!.token;
    expect(
      (await agent.confirm(token, { ...actor, sub: 'other' })).status,
    ).toBe('error');

    const confirmed = await agent.confirm(token, actor);
    expect(confirmed.status).toBe('done');
    expect(built.at(-1)?.calls[0].name).toBe('remove_item');

    expect((await agent.confirm(token, actor)).status).toBe('error');
  });

  it('expires confirmations after two minutes', () => {
    let now = 0;
    const store = new PendingConfirmations(() => now);
    const token = store.save('u1', [
      { tool: 'remove_item', args: {}, summary: 's' },
    ]);
    now = 121_000;
    expect(store.take(token, 'u1')).toBeNull();
  });
});
