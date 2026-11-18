import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AiService } from '../../../ai/ai.service';
import { BREAKDOWN_DIMENSIONS } from '../../../reports/dto/report-range-query.dto';
import { ReportsService } from '../../../reports/reports.service';
import { todayInZone } from '../../../reports/report-range';
import { evaluateAlerts } from '../../domain/alert-rules';
import type { Dataset } from '../../domain/dataset';
import { previousPeriod } from '../../domain/period';
import type { MonitoringSnapshotProvider } from './monitoring.snapshot';
import { errorResult, jsonResult, messageOf, rangeLabel } from './tool-helpers';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Fecha YYYY-MM-DD en la zona horaria del negocio');

const rangeShape = {
  from: date.optional().describe('Inicio (inclusive). Por defecto, hoy.'),
  to: date.optional().describe('Fin (inclusive). Por defecto, igual a from.'),
  areaId: z.string().uuid().optional().describe('Filtrar por área'),
  shiftId: z
    .string()
    .uuid()
    .optional()
    .describe('Filtrar por turno (id obtenido con get_breakdown by=shift)'),
};

const WEEKDAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export interface AnalyticsDeps {
  reports: ReportsService;
  ai: AiService;
  snapshots: MonitoringSnapshotProvider;
  timeZone: string;
}

export function registerAnalyticsTools(
  server: McpServer,
  deps: AnalyticsDeps,
): void {
  const { reports } = deps;
  const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };

  const run = (work: () => Promise<Record<string, unknown>>) =>
    work().then(jsonResult, (error: unknown) => errorResult(messageOf(error)));

  server.registerTool(
    'get_sales_summary',
    {
      title: 'Resumen de ventas',
      description:
        'Totales del periodo: ventas, órdenes, ticket promedio, descuentos, propinas y productos por orden.',
      inputSchema: rangeShape,
      annotations: readOnly,
    },
    ({ from, to, areaId, shiftId }) =>
      run(async () => {
        const summary = await reports.getSummary({ from, to, areaId, shiftId });
        return {
          datasets: [],
          facts: {
            ...summary,
            rangeLabel: rangeLabel(summary.from, summary.to),
          },
        };
      }),
  );

  server.registerTool(
    'get_sales_timeseries',
    {
      title: 'Ventas por periodo',
      description:
        'Serie de ventas y órdenes agrupada por día, semana o mes. Úsala para tendencias.',
      inputSchema: {
        ...rangeShape,
        groupBy: z
          .enum(['day', 'week', 'month'])
          .optional()
          .describe('Agrupación; por defecto día'),
      },
      annotations: readOnly,
    },
    ({ from, to, areaId, shiftId, groupBy }) =>
      run(async () => {
        const series = await reports.getTimeSeries({
          from,
          to,
          areaId,
          shiftId,
          groupBy: groupBy ?? 'day',
        });
        const unit =
          groupBy === 'month' ? 'Mes' : groupBy === 'week' ? 'Semana' : 'Día';
        const dataset: Dataset = {
          id: 'sales_timeseries',
          title: `Ventas por ${unit.toLowerCase()}`,
          columns: [
            { name: 'period', label: unit, kind: 'time' },
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
          rows: series.map((p) => ({
            period: p.period,
            totalSales: p.totalSales,
            totalOrders: p.totalOrders,
          })),
        };
        const sorted = [...series].sort((a, b) => b.totalSales - a.totalSales);
        const total = series.reduce((sum, p) => sum + p.totalSales, 0);
        return {
          datasets: series.length ? [dataset] : [],
          facts: {
            rangeLabel: rangeLabel(from, to),
            best: sorted[0] ?? null,
            worst: sorted.at(-1) ?? null,
            average: series.length ? total / series.length : 0,
            points: series.length,
          },
        };
      }),
  );

  server.registerTool(
    'get_breakdown',
    {
      title: 'Desglose de ventas',
      description:
        'Ventas y órdenes por área, mesa, categoría, método de pago, hora, mesero o turno (Día/Noche).',
      inputSchema: {
        ...rangeShape,
        by: z.enum(BREAKDOWN_DIMENSIONS).describe('Dimensión del desglose'),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: readOnly,
    },
    ({ from, to, areaId, shiftId, by, limit }) =>
      run(async () => {
        const items = await reports.getBreakdown({
          from,
          to,
          areaId,
          shiftId,
          by,
          limit: limit ?? 20,
        });
        const names: Record<string, string> = {
          area: 'área',
          table: 'mesa',
          category: 'categoría',
          paymentMethod: 'método de pago',
          hour: 'hora',
          waiter: 'mesero',
          shift: 'turno',
        };
        const dataset: Dataset = {
          id: `breakdown_${by}`,
          title: `Ventas por ${names[by]}`,
          columns: [
            {
              name: 'label',
              label: names[by][0].toUpperCase() + names[by].slice(1),
              kind: 'category',
            },
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
          rows: items.map((i) => ({
            label: i.label,
            totalSales: i.totalSales,
            totalOrders: i.totalOrders,
          })),
        };
        const total = items.reduce((sum, i) => sum + i.totalSales, 0);
        const top = [...items].sort((a, b) => b.totalSales - a.totalSales)[0];
        return {
          datasets: items.length ? [dataset] : [],
          facts: {
            rangeLabel: rangeLabel(from, to),
            dimension: by,
            leader: top
              ? { ...top, share: total ? top.totalSales / total : 0 }
              : null,
            total,
          },
        };
      }),
  );

  server.registerTool(
    'get_top_products',
    {
      title: 'Productos más vendidos',
      description: 'Ranking de productos por cantidad vendida con su ingreso.',
      inputSchema: {
        ...rangeShape,
        limit: z.number().int().min(1).max(30).optional(),
      },
      annotations: readOnly,
    },
    ({ from, to, areaId, shiftId, limit }) =>
      run(async () => {
        const products = await reports.getTopProducts({
          from,
          to,
          areaId,
          shiftId,
          limit: limit ?? 8,
        });
        const dataset: Dataset = {
          id: 'top_products',
          title: 'Productos más vendidos',
          columns: [
            { name: 'name', label: 'Producto', kind: 'category' },
            {
              name: 'quantity',
              label: 'Unidades',
              kind: 'number',
              format: 'integer',
            },
            {
              name: 'revenue',
              label: 'Ingreso',
              kind: 'number',
              format: 'currency',
            },
          ],
          rows: products.map((p) => ({
            name: p.productName,
            quantity: p.quantitySold,
            revenue: p.totalRevenue,
          })),
        };
        const top = products[0];
        return {
          datasets: products.length ? [dataset] : [],
          facts: {
            rangeLabel: rangeLabel(from, to),
            count: products.length,
            leader: top
              ? {
                  name: top.productName,
                  quantity: top.quantitySold,
                  revenue: top.totalRevenue,
                }
              : null,
            totalRevenue: products.reduce((sum, p) => sum + p.totalRevenue, 0),
          },
        };
      }),
  );

  server.registerTool(
    'compare_periods',
    {
      title: 'Comparar con el periodo anterior',
      description:
        'Compara el periodo pedido con otro (compareFrom/compareTo) o, si no se indica, con el periodo anterior de igual duración. Devuelve variaciones porcentuales y la serie diaria de ambos.',
      inputSchema: {
        ...rangeShape,
        compareFrom: date
          .optional()
          .describe('Inicio del periodo de comparación'),
        compareTo: date.optional().describe('Fin del periodo de comparación'),
      },
      annotations: readOnly,
    },
    ({ from, to, areaId, compareFrom, compareTo }) =>
      run(async () => {
        const start = from ?? todayInZone(deps.timeZone);
        const end = to ?? start;
        const before =
          compareFrom && compareTo
            ? { from: compareFrom, to: compareTo }
            : previousPeriod(start, end);
        const [comparison, current, previous] = await Promise.all([
          reports.getComparison({ from: start, to: end, areaId }, before),
          reports.getTimeSeries({
            from: start,
            to: end,
            areaId,
            groupBy: 'day',
          }),
          reports.getTimeSeries({
            from: before.from,
            to: before.to,
            areaId,
            groupBy: 'day',
          }),
        ]);
        const length = Math.max(current.length, previous.length);
        const dataset: Dataset = {
          id: 'comparison_series',
          title: 'Ventas: periodo actual vs anterior',
          columns: [
            { name: 'day', label: 'Día del periodo', kind: 'time' },
            {
              name: 'current',
              label: 'Periodo actual',
              kind: 'number',
              format: 'currency',
            },
            {
              name: 'previous',
              label: 'Periodo anterior',
              kind: 'number',
              format: 'currency',
            },
          ],
          rows: Array.from({ length }, (_, i) => ({
            day: `Día ${i + 1}`,
            current: current[i]?.totalSales ?? 0,
            previous: previous[i]?.totalSales ?? 0,
          })),
        };
        return {
          datasets: length ? [dataset] : [],
          facts: {
            rangeLabel: rangeLabel(start, end),
            previousRange: rangeLabel(before.from, before.to),
            current: comparison.current,
            previous: comparison.previous,
            deltas: comparison.deltas,
          },
        };
      }),
  );

  server.registerTool(
    'get_heatmap',
    {
      title: 'Horas y días de mayor venta',
      description:
        'Distribución de ventas por hora del día y por día de la semana, con el pico combinado.',
      inputSchema: rangeShape,
      annotations: readOnly,
    },
    ({ from, to, areaId, shiftId }) =>
      run(async () => {
        const cells = await reports.getHeatmap({ from, to, areaId });
        const byHour = new Map<number, { sales: number; orders: number }>();
        const byDay = new Map<number, { sales: number; orders: number }>();
        for (const cell of cells) {
          const h = byHour.get(cell.hour) ?? { sales: 0, orders: 0 };
          h.sales += cell.totalSales;
          h.orders += cell.totalOrders;
          byHour.set(cell.hour, h);
          const d = byDay.get(cell.weekday) ?? { sales: 0, orders: 0 };
          d.sales += cell.totalSales;
          d.orders += cell.totalOrders;
          byDay.set(cell.weekday, d);
        }
        const hourSet: Dataset = {
          id: 'sales_by_hour',
          title: 'Ventas por hora del día',
          columns: [
            { name: 'hour', label: 'Hora', kind: 'category' },
            {
              name: 'sales',
              label: 'Ventas',
              kind: 'number',
              format: 'currency',
            },
            {
              name: 'orders',
              label: 'Órdenes',
              kind: 'number',
              format: 'integer',
            },
          ],
          rows: [...byHour.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([h, v]) => ({
              hour: `${String(h).padStart(2, '0')}:00`,
              sales: v.sales,
              orders: v.orders,
            })),
        };
        const weekOrder = [1, 2, 3, 4, 5, 6, 0];
        const daySet: Dataset = {
          id: 'sales_by_weekday',
          title: 'Ventas por día de la semana',
          columns: [
            { name: 'weekday', label: 'Día', kind: 'category' },
            {
              name: 'sales',
              label: 'Ventas',
              kind: 'number',
              format: 'currency',
            },
            {
              name: 'orders',
              label: 'Órdenes',
              kind: 'number',
              format: 'integer',
            },
          ],
          rows: weekOrder
            .filter((d) => byDay.has(d))
            .map((d) => ({
              weekday: WEEKDAYS[d],
              sales: byDay.get(d)!.sales,
              orders: byDay.get(d)!.orders,
            })),
        };
        const peakCell = [...cells].sort(
          (a, b) => b.totalSales - a.totalSales,
        )[0];
        const peakHour = [...byHour.entries()].sort(
          (a, b) => b[1].sales - a[1].sales,
        )[0];
        const peakDay = [...byDay.entries()].sort(
          (a, b) => b[1].sales - a[1].sales,
        )[0];
        return {
          datasets: cells.length ? [hourSet, daySet] : [],
          facts: cells.length
            ? {
                rangeLabel: rangeLabel(from, to),
                peakHour: peakHour[0],
                peakWeekday: peakDay[0],
                peakCell,
              }
            : {},
        };
      }),
  );

  server.registerTool(
    'get_live_status',
    {
      title: 'Estado en vivo',
      description:
        'Órdenes abiertas, mesas ocupadas y pedidos pendientes en cocina ahora mismo.',
      inputSchema: {},
      annotations: readOnly,
    },
    () =>
      run(async () => {
        const snapshot = await deps.snapshots.collect();
        return {
          datasets: [],
          facts: {
            openOrders: snapshot.openOrders.length,
            tablesOccupied: snapshot.tablesOccupied,
            tablesTotal: snapshot.tablesTotal,
            kitchenPending: snapshot.kitchenPending.length,
          },
        };
      }),
  );

  server.registerTool(
    'get_alerts',
    {
      title: 'Alertas activas',
      description:
        'Evalúa reglas de monitoreo (ventas vs lo habitual, descuentos, órdenes abiertas, cocina, cancelaciones, ocupación).',
      inputSchema: {},
      annotations: readOnly,
    },
    () =>
      run(async () => {
        const snapshot = await deps.snapshots.collect();
        return {
          datasets: [],
          facts: {
            alerts: evaluateAlerts(snapshot),
            generatedAt: snapshot.generatedAt,
          },
        };
      }),
  );

  server.registerTool(
    'get_sales_forecast',
    {
      title: 'Pronóstico de ventas',
      description:
        'Pronóstico del servicio de IA para los próximos días. Puede no estar disponible.',
      inputSchema: { horizon: z.number().int().min(1).max(30).optional() },
      annotations: { ...readOnly, openWorldHint: true },
    },
    ({ horizon }) =>
      run(async () => {
        const forecast = (await deps.ai.getSalesForecast(horizon ?? 7)) as {
          insufficient_data?: boolean;
          forecast?: { date: string; predicted_sales: number }[];
        };
        if (forecast.insufficient_data || !forecast.forecast?.length) {
          return { datasets: [], facts: { available: false } };
        }
        const dataset: Dataset = {
          id: 'sales_forecast',
          title: 'Pronóstico de ventas',
          columns: [
            { name: 'date', label: 'Día', kind: 'time' },
            {
              name: 'predicted',
              label: 'Ventas previstas',
              kind: 'number',
              format: 'currency',
            },
          ],
          rows: forecast.forecast.map((p) => ({
            date: p.date,
            predicted: p.predicted_sales,
          })),
        };
        return {
          datasets: [dataset],
          facts: { available: true },
        };
      }),
  );
}
