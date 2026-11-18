import { autoChartIntent, buildChartSpec } from './chart-spec';
import type { Dataset } from './dataset';
import { evaluateAlerts, type MonitoringSnapshot } from './alert-rules';
import { percentChange, periodLengthDays, previousPeriod } from './period';

const series: Dataset = {
  id: 'ts:1',
  title: 'Ventas por día',
  columns: [
    { name: 'period', label: 'Día', kind: 'time' },
    { name: 'sales', label: 'Ventas', kind: 'number', format: 'currency' },
    { name: 'orders', label: 'Órdenes', kind: 'number', format: 'integer' },
  ],
  rows: [
    { period: '2026-11-01', sales: 100, orders: 4 },
    { period: '2026-11-02', sales: 150, orders: 6 },
  ],
};

describe('chart spec', () => {
  it('builds a combo chart with bars on the left and a line on the right axis', () => {
    const spec = buildChartSpec(series, {
      type: 'combo',
      x: 'period',
      y: ['sales', 'orders'],
    });
    expect(spec?.series.map((s) => [s.mark, s.axis])).toEqual([
      ['bar', 'left'],
      ['line', 'right'],
    ]);
  });

  it('rejects unknown columns, non numeric series and empty data', () => {
    expect(
      buildChartSpec(series, { type: 'line', x: 'nope', y: ['sales'] }),
    ).toBeNull();
    expect(
      buildChartSpec(series, { type: 'line', x: 'period', y: ['period'] }),
    ).toBeNull();
    expect(
      buildChartSpec(
        { ...series, rows: [] },
        { type: 'line', x: 'period', y: ['sales'] },
      ),
    ).toBeNull();
  });

  it('collapses the tail of a pie chart into "Otros"', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      key: `k${i}`,
      total: 100 - i,
    }));
    const spec = buildChartSpec(
      {
        id: 'b:1',
        title: 'Métodos de pago',
        columns: [
          { name: 'key', label: 'Método', kind: 'category' },
          { name: 'total', label: 'Total', kind: 'number', format: 'currency' },
        ],
        rows,
      },
      { type: 'pie', x: 'key', y: ['total'] },
    );
    expect(spec?.data).toHaveLength(8);
    expect(spec?.data.at(-1)?.key).toBe('Otros');
  });

  it('overlays two comparable series as lines', () => {
    const cmp: Dataset = {
      id: 'c:1',
      title: 'Ventas: periodo actual vs anterior',
      columns: [
        { name: 'day', label: 'Día', kind: 'time' },
        {
          name: 'current',
          label: 'Actual',
          kind: 'number',
          format: 'currency',
        },
        {
          name: 'previous',
          label: 'Anterior',
          kind: 'number',
          format: 'currency',
        },
      ],
      rows: [
        { day: 'Día 1', current: 10, previous: 8 },
        { day: 'Día 2', current: 12, previous: 9 },
      ],
    };
    const intent = autoChartIntent(cmp);
    expect(intent).toMatchObject({ type: 'line', y: ['current', 'previous'] });
    expect(buildChartSpec(cmp, intent!)?.series.map((s) => s.mark)).toEqual([
      'line',
      'line',
    ]);
  });

  it('suggests a combo for time series and a pie for payment shares', () => {
    expect(autoChartIntent(series)?.type).toBe('combo');
    const pay: Dataset = {
      id: 'p:1',
      title: 'Ventas por método de pago',
      columns: [
        { name: 'label', label: 'Método', kind: 'category' },
        { name: 'sales', label: 'Ventas', kind: 'number', format: 'currency' },
      ],
      rows: [
        { label: 'Efectivo', sales: 10 },
        { label: 'Tarjeta', sales: 5 },
      ],
    };
    expect(autoChartIntent(pay)?.type).toBe('pie');
  });
});

describe('period helpers', () => {
  it('computes the previous period of equal length', () => {
    expect(periodLengthDays('2026-11-01', '2026-11-07')).toBe(7);
    expect(previousPeriod('2026-11-08', '2026-11-14')).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
    });
  });

  it('returns null when the base is zero', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(150, 100)).toBe(50);
  });
});

describe('alert rules', () => {
  const base: MonitoringSnapshot = {
    generatedAt: '2026-11-16T20:00:00Z',
    localHour: 16,
    salesToday: 900,
    ordersToday: 12,
    baselineSales: 1000,
    discountRateToday: 0.02,
    discountRateBaseline: 0.02,
    cancelledToday: 0,
    cancelledBaseline: 0.5,
    tablesOccupied: 2,
    tablesTotal: 10,
    openOrders: [],
    kitchenPending: [],
  };

  it('stays quiet on a normal day', () => {
    expect(evaluateAlerts(base)).toEqual([]);
  });

  it('flags a sales drop, long orders and kitchen delays by severity', () => {
    const alerts = evaluateAlerts({
      ...base,
      salesToday: 250,
      openOrders: [
        { orderNumber: '1', table: '5', minutesOpen: 190, total: 300 },
      ],
      kitchenPending: [{ orderNumber: '2', table: '7', minutesWaiting: 25 }],
    });
    expect(alerts.map((a) => [a.id, a.severity])).toEqual([
      ['sales_drop', 'critical'],
      ['long_open_orders', 'critical'],
      ['kitchen_delay', 'warning'],
    ]);
  });

  it('does not judge sales before the afternoon', () => {
    expect(evaluateAlerts({ ...base, localHour: 11, salesToday: 10 })).toEqual(
      [],
    );
  });

  it('flags discount spikes only with enough orders', () => {
    expect(
      evaluateAlerts({ ...base, discountRateToday: 0.2, ordersToday: 3 }),
    ).toEqual([]);
    expect(
      evaluateAlerts({ ...base, discountRateToday: 0.2 }).map((a) => a.id),
    ).toContain('discount_spike');
  });
});
