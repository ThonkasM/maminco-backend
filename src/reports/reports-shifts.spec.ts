import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShiftsConfig, ShiftsService } from '../shifts/shifts.service';
import { ReportsService } from './reports.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

const config: ShiftsConfig = {
  businessDayStartMinute: 360,
  shifts: [
    { id: 'day', name: 'Día', startMinute: 360, endMinute: 1080, sortOrder: 0 },
    {
      id: 'night',
      name: 'Noche',
      startMinute: 1080,
      endMinute: 360,
      sortOrder: 1,
    },
  ],
};

function build(rows: unknown[]) {
  const queryRaw = jest.fn().mockResolvedValue(rows);
  const service = new ReportsService(
    { $queryRaw: queryRaw } as unknown as PrismaService,
    { get: () => 'America/La_Paz' } as unknown as ConfigService,
    { getConfig: () => Promise.resolve(config) } as unknown as ShiftsService,
  );
  return { service, queryRaw };
}

/** Rebuilds the executed query (nested fragments flattened) from the tagged-template call. */
const sqlOf = (call: unknown[]) => {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  const query = Prisma.sql(strings, ...values);
  return { text: query.sql, values: query.values };
};

describe('ReportsService shifts', () => {
  it('assigns per-minute totals to shifts, including after midnight', async () => {
    const { service } = build([
      { minute: 600, totalSales: '100.00', totalOrders: 2 }, // 10:00 Día
      { minute: 1380, totalSales: '50.00', totalOrders: 1 }, // 23:00 Noche
      { minute: 180, totalSales: '30.00', totalOrders: 1 }, // 03:00 Noche
    ]);
    const items = await service.getBreakdown({
      from: '2026-11-10',
      to: '2026-11-10',
      by: 'shift',
    });
    expect(items).toEqual([
      { key: 'day', label: 'Día', totalSales: 100, totalOrders: 2 },
      { key: 'night', label: 'Noche', totalSales: 80, totalOrders: 2 },
    ]);
  });

  it('returns every shift even when there are no sales', async () => {
    const { service } = build([]);
    const items = await service.getBreakdown({ by: 'shift' });
    expect(items.map((item) => item.label)).toEqual(['Día', 'Noche']);
    expect(items.every((item) => item.totalSales === 0)).toBe(true);
  });

  it('shifts the date range by the business day start', async () => {
    const { service, queryRaw } = build([]);
    await service.getSummary({ from: '2026-11-10', to: '2026-11-10' });
    const { values } = sqlOf(queryRaw.mock.calls[0] as unknown[]);
    const dates = values.filter(
      (value): value is Date => value instanceof Date,
    );
    // 2026-11-10 00:00 La Paz = 04:00Z, plus the 06:00 business day start = 10:00Z
    expect(dates[0].toISOString()).toBe('2026-11-10T10:00:00.000Z');
    expect(dates[1].toISOString()).toBe('2026-11-11T10:00:00.000Z');
  });

  it('adds a time-of-day filter for a shift that crosses midnight', async () => {
    const { service, queryRaw } = build([]);
    await service.getSummary({ from: '2026-11-10', shiftId: 'night' });
    const { text, values } = sqlOf(queryRaw.mock.calls[0] as unknown[]);
    expect(text).toContain(' OR ');
    expect(values).toEqual(expect.arrayContaining([1080, 360]));
  });

  it('matches nothing for an unknown shift', async () => {
    const { service, queryRaw } = build([]);
    await service.getSummary({ from: '2026-11-10', shiftId: 'nope' });
    const { text } = sqlOf(queryRaw.mock.calls[0] as unknown[]);
    expect(text).toContain('FALSE');
  });
});
