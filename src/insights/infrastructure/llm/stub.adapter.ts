import type {
  LlmContentBlock,
  LlmEngineInfo,
  LlmPort,
  LlmRequest,
  LlmResponse,
} from '../../application/ports/llm.port';
import type { Dataset } from '../../domain/dataset';
import type { MenuEntry } from '../../domain/menu-match';
import { parseVoiceCommand } from '../../domain/voice-grammar';

interface ToolData {
  tool: string;
  payload: Record<string, unknown>;
}

const bs = (n: unknown) =>
  `Bs. ${Math.round(Number(n) || 0).toLocaleString('es-BO')}`;
const pct = (n: unknown) => `${Math.round((Number(n) || 0) * 10) / 10} %`;
const DAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

const text = (value: string): LlmContentBlock => ({
  type: 'text',
  text: value,
});

function respond(content: LlmContentBlock[], model: string): LlmResponse {
  const hasTools = content.some((block) => block.type === 'tool_use');
  return {
    stopReason: hasTools ? 'tool_use' : 'end_turn',
    content,
    usage: { inputTokens: 0, outputTokens: 0 },
    model,
    engine: 'local',
  };
}

function firstUserText(request: LlmRequest): string {
  const first = request.messages[0]?.content.find((b) => b.type === 'text');
  return first && first.type === 'text' ? first.text : '';
}

function toolData(request: LlmRequest): ToolData[] {
  const out: ToolData[] = [];
  for (const message of request.messages) {
    for (const block of message.content) {
      if (block.type !== 'tool_result') continue;
      const match = /<tool_data tool="([^"]+)">([\s\S]*)<\/tool_data>/.exec(
        block.content,
      );
      if (!match) continue;
      try {
        out.push({
          tool: match[1],
          payload: JSON.parse(match[2]) as Record<string, unknown>,
        });
      } catch {
        out.push({ tool: match[1], payload: { error: block.content } });
      }
    }
  }
  return out;
}

interface Facts {
  rangeLabel?: string;
  previousRange?: string;
  totalSales?: number;
  totalOrders?: number;
  averageOrderValue?: number;
  totalDiscount?: number;
  totalTips?: number;
  best?: { period: string; totalSales: number } | null;
  worst?: { period: string; totalSales: number } | null;
  average?: number;
  leader?: {
    label?: string;
    name?: string;
    totalSales?: number;
    quantity?: number;
    revenue?: number;
    share?: number;
  } | null;
  count?: number;
  totalRevenue?: number;
  deltas?: Record<string, number | null>;
  current?: { totalSales: number };
  previous?: { totalSales: number };
  peakHour?: number;
  peakWeekday?: number;
  peakCell?: { weekday: number; hour: number };
  openOrders?: number;
  tablesOccupied?: number;
  tablesTotal?: number;
}

const field = (message: string, key: string): string =>
  new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(message)?.[1]?.trim() ?? '';

function describe(
  tool: string,
  facts: Facts,
  label: string,
): { sentence: string; followUps: string[] } | null {
  switch (tool) {
    case 'get_sales_summary':
      return {
        sentence: `${label ? `En ${label}` : 'En el periodo'} vendiste ${bs(facts.totalSales)} en ${facts.totalOrders ?? 0} órdenes (ticket promedio ${bs(facts.averageOrderValue)}). Descuentos: ${bs(facts.totalDiscount)}; propinas: ${bs(facts.totalTips)}.`,
        followUps: [
          'Compara con el periodo anterior',
          '¿Cuáles fueron los productos más vendidos?',
        ],
      };
    case 'get_sales_timeseries':
      return {
        sentence:
          facts.best && facts.worst
            ? `Tu mejor día fue ${facts.best.period} (${bs(facts.best.totalSales)}) y el más flojo ${facts.worst.period} (${bs(facts.worst.totalSales)}). Promedio diario: ${bs(facts.average)}.`
            : 'No hay ventas registradas en ese periodo.',
        followUps: ['¿A qué horas vendo más?'],
      };
    case 'get_top_products':
      return {
        sentence: facts.leader
          ? `El más vendido es ${facts.leader.name} (${facts.leader.quantity} unidades, ${bs(facts.leader.revenue)}). Los ${facts.count ?? 0} primeros suman ${bs(facts.totalRevenue)}.`
          : 'No hay productos vendidos en ese periodo.',
        followUps: ['Muéstrame las ventas por categoría'],
      };
    case 'get_breakdown':
      return {
        sentence: facts.leader
          ? `Lidera ${facts.leader.label} con ${bs(facts.leader.totalSales)} (${pct((facts.leader.share ?? 0) * 100)} de la venta).`
          : 'No hay datos para ese desglose.',
        followUps: ['¿Cómo evolucionaron las ventas por día?'],
      };
    case 'compare_periods': {
      const sales = facts.deltas?.totalSales ?? null;
      const orders = facts.deltas?.totalOrders ?? null;
      const salesText =
        sales === null
          ? 'No hay base de comparación en el periodo anterior.'
          : `Las ventas ${sales >= 0 ? 'subieron' : 'bajaron'} ${pct(Math.abs(sales))} frente al periodo de comparación${facts.previousRange ? ` (${facts.previousRange})` : ''}: ${bs(facts.current?.totalSales)} vs ${bs(facts.previous?.totalSales)}.`;
      const ordersText =
        orders === null
          ? ''
          : ` Órdenes: ${orders >= 0 ? '+' : ''}${pct(orders)}.`;
      return {
        sentence: `${salesText}${ordersText}`,
        followUps: ['¿Qué productos explican el cambio?'],
      };
    }
    case 'get_heatmap': {
      const cell = facts.peakCell;
      if (
        facts.peakHour === undefined ||
        facts.peakWeekday === undefined ||
        !cell
      ) {
        return {
          sentence: 'No hay suficientes ventas para ver horarios.',
          followUps: [],
        };
      }
      return {
        sentence: `La hora más fuerte es las ${String(facts.peakHour).padStart(2, '0')}:00 y el mejor día es ${DAYS[facts.peakWeekday]}. El pico combinado es ${DAYS[cell.weekday]} a las ${String(cell.hour).padStart(2, '0')}:00.`,
        followUps: ['¿Qué métodos de pago usan más?'],
      };
    }
    case 'get_live_status':
      return {
        sentence: `Ahora hay ${facts.openOrders ?? 0} órdenes abiertas y ${facts.tablesOccupied ?? 0} de ${facts.tablesTotal ?? 0} mesas ocupadas.`,
        followUps: [],
      };
    default:
      return null;
  }
}

export class StubLlmAdapter implements LlmPort {
  readonly info: LlmEngineInfo = {
    id: 'local',
    label: 'Motor local (sin modelo)',
    model: 'reglas',
    external: false,
  };

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  complete(request: LlmRequest): Promise<LlmResponse> {
    switch (request.purpose) {
      case 'report':
        return Promise.resolve(this.report(request));
      case 'monitor':
        return Promise.resolve(this.monitor(request));
      case 'voice':
        return Promise.resolve(this.voice(request));
    }
  }

  private report(request: LlmRequest): LlmResponse {
    const message = firstUserText(request);
    const results = toolData(request);
    const question = field(message, 'PREGUNTA');
    const range = /from=(\S+)\s+to=(\S+)/.exec(
      field(message, 'RANGO_SUGERIDO'),
    );
    const from = range?.[1];
    const to = range?.[2];
    const compare = /from=(\S+)\s+to=(\S+)/.exec(
      field(message, 'COMPARAR_CON'),
    );
    const q = question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    if (results.length === 0) {
      const base = { from, to };
      const calls: { name: string; input: Record<string, unknown> }[] = [];
      const topMatch = /\btop\s*(\d{1,2})/.exec(q);
      if (/ahora|en vivo|estado actual|mesas ocupadas|abiertas/.test(q)) {
        calls.push({ name: 'get_live_status', input: {} });
      } else if (/turno|turnos|\bnoche\b|\bdia o noche\b|shift/.test(q)) {
        calls.push({ name: 'get_breakdown', input: { ...base, by: 'shift' } });
      } else if (/compar|contra|respecto|vs\b|anterior/.test(q)) {
        calls.push({
          name: 'compare_periods',
          input: compare
            ? { ...base, compareFrom: compare[1], compareTo: compare[2] }
            : base,
        });
      } else if (
        /hora|pico|horario|dia de la semana|dias de la semana|mapa de calor/.test(
          q,
        )
      ) {
        calls.push({ name: 'get_heatmap', input: base });
      } else if (/producto|plato|vend|top\b|mas pedido|menos/.test(q)) {
        calls.push({
          name: 'get_top_products',
          input: { ...base, limit: topMatch ? Number(topMatch[1]) : 8 },
        });
      } else if (/pago|efectivo|tarjeta|transferencia|metodo/.test(q)) {
        calls.push({
          name: 'get_breakdown',
          input: { ...base, by: 'paymentMethod' },
        });
      } else if (/categoria/.test(q)) {
        calls.push({
          name: 'get_breakdown',
          input: { ...base, by: 'category' },
        });
      } else if (/mesero|camarero|atend/.test(q)) {
        calls.push({ name: 'get_breakdown', input: { ...base, by: 'waiter' } });
      } else if (/\barea|salon|terraza/.test(q)) {
        calls.push({ name: 'get_breakdown', input: { ...base, by: 'area' } });
      } else if (/\bmesas?\b/.test(q)) {
        calls.push({ name: 'get_breakdown', input: { ...base, by: 'table' } });
      } else if (
        /tendencia|evoluci|diari|por dia|cada dia|crec|historic|semana a semana/.test(
          q,
        )
      ) {
        calls.push({
          name: 'get_sales_timeseries',
          input: { ...base, groupBy: 'day' },
        });
      } else {
        calls.push({ name: 'get_sales_summary', input: base });
        calls.push({
          name: 'get_sales_timeseries',
          input: { ...base, groupBy: 'day' },
        });
      }
      return respond(
        calls.map((call, index) => ({
          type: 'tool_use' as const,
          id: `stub_${index}`,
          name: call.name,
          input: call.input,
        })),
        'reglas',
      );
    }

    const sentences: string[] = [];
    const charts: Record<string, unknown>[] = [];
    const followUps = new Set<string>();

    for (const { tool, payload } of results) {
      if (payload.error) {
        sentences.push('No pude consultar uno de los datos solicitados.');
        continue;
      }
      const facts = (payload.facts ?? {}) as Facts;
      const datasets = (payload.datasets ?? []) as Dataset[];
      const label = facts.rangeLabel ?? '';
      const described = describe(tool, facts, label);
      if (described) {
        sentences.push(described.sentence);
        described.followUps.forEach((f) => followUps.add(f));
      }
      for (const dataset of datasets) {
        charts.push({ dataset: dataset.id });
      }
    }

    return respond(
      [
        text(
          JSON.stringify({
            answer: sentences.join(' '),
            charts,
            followUps: [...followUps].slice(0, 3),
          }),
        ),
      ],
      'reglas',
    );
  }

  private monitor(request: LlmRequest): LlmResponse {
    const message = firstUserText(request);
    let alerts: { severity: string; title: string }[] = [];
    try {
      alerts = JSON.parse(
        field(message, 'ALERTAS_JSON') || '[]',
      ) as typeof alerts;
    } catch {
      alerts = [];
    }
    if (alerts.length === 0) {
      return respond(
        [text('Todo en orden: no hay desviaciones respecto a lo habitual.')],
        'reglas',
      );
    }
    const critical = alerts.filter((a) => a.severity === 'critical').length;
    const warning = alerts.filter((a) => a.severity === 'warning').length;
    const parts: string[] = [];
    if (critical) parts.push(`${critical} crítica${critical === 1 ? '' : 's'}`);
    if (warning) parts.push(`${warning} de atención`);
    return respond(
      [
        text(
          `Hay ${alerts.length} aviso${alerts.length === 1 ? '' : 's'}${parts.length ? ` (${parts.join(' y ')})` : ''}. Prioriza: ${alerts[0].title.toLowerCase()}.`,
        ),
      ],
      'reglas',
    );
  }

  private voice(request: LlmRequest): LlmResponse {
    const message = firstUserText(request);
    const transcript = field(message, 'TRANSCRIPCION');
    const contextTable = Number(field(message, 'MESA_CONTEXTO')) || null;
    const command = parseVoiceCommand(transcript);
    const table = command.table ?? contextTable;
    const results = toolData(request);
    const searches = results.filter((r) => r.tool === 'search_menu');
    const writes = results.filter((r) =>
      [
        'open_table_order',
        'add_item',
        'set_item_quantity',
        'remove_item',
      ].includes(r.tool),
    );

    if (results.length === 0) {
      if (command.ops.length === 0) {
        return respond(
          [
            text(
              'No entendí la orden. Prueba con: «abre la mesa 4 y agrega dos patos criollos».',
            ),
          ],
          'reglas',
        );
      }
      if (table === null) {
        return respond(
          [text('¿En qué mesa? Di el número de mesa en la orden.')],
          'reglas',
        );
      }
      const names = [
        ...new Set(command.ops.filter((o) => o.name).map((o) => o.name)),
      ];
      const calls: LlmContentBlock[] = names.map((name, i) => ({
        type: 'tool_use',
        id: `search_${i}`,
        name: 'search_menu',
        input: { query: name },
      }));
      calls.push({
        type: 'tool_use',
        id: 'order',
        name: 'get_table_order',
        input: { tableNumber: table },
      });
      return respond(calls, 'reglas');
    }

    if (writes.length === 0 && searches.length + results.length > 0) {
      const orderFacts = (results.find((r) => r.tool === 'get_table_order')
        ?.payload.facts ?? {}) as {
        order?: { items: { productId: string; quantity: number }[] } | null;
      };
      const hasOrder = Boolean(orderFacts.order);
      const lines = new Map(
        (orderFacts.order?.items ?? []).map((i) => [i.productId, i.quantity]),
      );
      const calls: LlmContentBlock[] = [];
      const resolve = (name: string) => {
        const found = searches.find(
          (s) =>
            (s.payload.facts as { query?: string } | undefined)?.query === name,
        );
        const matches =
          (
            found?.payload.facts as
              { matches?: (MenuEntry & { score: number })[] } | undefined
          )?.matches ?? [];
        return matches.find((m) => m.score >= 0.6 && m.available) ?? null;
      };

      const needsOrder = command.ops.some(
        (o) => o.op === 'open' || o.op === 'add' || o.op === 'increase',
      );
      let n = 0;
      if (needsOrder && !hasOrder) {
        calls.push({
          type: 'tool_use',
          id: `w${n++}`,
          name: 'open_table_order',
          input: { tableNumber: table },
        });
      }
      for (const op of command.ops) {
        if (op.op === 'open' || !op.name) continue;
        const product = resolve(op.name);
        if (!product) continue;
        const current = lines.get(product.id) ?? 0;
        const qty = op.quantity ?? 1;
        if (op.op === 'add' || (op.op === 'increase' && current === 0)) {
          calls.push({
            type: 'tool_use',
            id: `w${n++}`,
            name: 'add_item',
            input: { tableNumber: table, productId: product.id, quantity: qty },
          });
          lines.set(product.id, current + qty);
        } else if (op.op === 'increase') {
          calls.push({
            type: 'tool_use',
            id: `w${n++}`,
            name: 'set_item_quantity',
            input: {
              tableNumber: table,
              productId: product.id,
              quantity: current + qty,
            },
          });
          lines.set(product.id, current + qty);
        } else if (op.op === 'decrease') {
          calls.push({
            type: 'tool_use',
            id: `w${n++}`,
            name: 'set_item_quantity',
            input: {
              tableNumber: table,
              productId: product.id,
              quantity: Math.max(current - qty, 0),
            },
          });
          lines.set(product.id, Math.max(current - qty, 0));
        } else if (op.op === 'set') {
          calls.push({
            type: 'tool_use',
            id: `w${n++}`,
            name: 'set_item_quantity',
            input: { tableNumber: table, productId: product.id, quantity: qty },
          });
          lines.set(product.id, qty);
        } else if (op.op === 'remove') {
          calls.push({
            type: 'tool_use',
            id: `w${n++}`,
            name: 'remove_item',
            input: { tableNumber: table, productId: product.id },
          });
          lines.delete(product.id);
        }
      }
      if (calls.length === 0) {
        const missing = command.ops
          .filter((o) => o.name && !resolve(o.name))
          .map((o) => o.name);
        return respond(
          [
            text(
              missing.length
                ? `No encontré en el menú: ${missing.join(', ')}.`
                : 'No había nada que hacer.',
            ),
          ],
          'reglas',
        );
      }
      return respond(calls, 'reglas');
    }

    const summaries = writes
      .map((w) => (w.payload.summary as string | undefined) ?? '')
      .filter(Boolean);
    const unresolved = command.ops
      .filter((o) => o.name)
      .filter((o) => {
        const found = searches.find(
          (s) =>
            (s.payload.facts as { query?: string } | undefined)?.query ===
            o.name,
        );
        const matches =
          (
            found?.payload.facts as
              { matches?: { score: number }[] } | undefined
          )?.matches ?? [];
        return !matches.some((m) => m.score >= 0.6);
      })
      .map((o) => o.name);
    const extra = unresolved.length
      ? ` No encontré en el menú: ${unresolved.join(', ')}.`
      : '';
    return respond(
      [
        text(
          `${summaries.join('. ')}${summaries.length ? '.' : ''}${extra}`.trim(),
        ),
      ],
      'reglas',
    );
  }
}
