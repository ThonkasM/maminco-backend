import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { todayInZone } from '../../../reports/report-range';
import { ReportsService } from '../../../reports/reports.service';
import type { MonitoringSnapshot } from '../../domain/alert-rules';
import { periodLengthDays } from '../../domain/period';

const DAY_MS = 86_400_000;

@Injectable()
export class MonitoringSnapshotProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly flags: FeatureFlagsService,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz';
  }

  async collect(): Promise<MonitoringSnapshot> {
    const tz = this.timeZone;
    const now = new Date();
    const today = todayInZone(tz);
    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      }).format(now),
    );
    const base = Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)),
    );
    const from30 = new Date(base - 30 * DAY_MS).toISOString().slice(0, 10);
    const yesterday = new Date(base - DAY_MS).toISOString().slice(0, 10);
    const from28 = new Date(base - 28 * DAY_MS).toISOString().slice(0, 10);

    const [
      todaySummary,
      history,
      sameWeekday,
      cancelled,
      tables,
      open,
      kitchenOn,
    ] = await Promise.all([
      this.reports.getSummary({ from: today, to: today }),
      this.reports.getSummary({ from: from30, to: yesterday }),
      this.prisma.$queryRaw<{ day: string; sales: string }[]>`
        SELECT to_char(((COALESCE(o."closedAt", o."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::date, 'YYYY-MM-DD') AS "day",
               COALESCE(SUM(o.total), 0)::text AS "sales"
        FROM orders o
        WHERE o.status = 'CLOSED'
          AND ((COALESCE(o."closedAt", o."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::date BETWEEN ${from28}::date AND ${yesterday}::date
          AND EXTRACT(DOW FROM ((COALESCE(o."closedAt", o."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)) = EXTRACT(DOW FROM ${today}::date)
          AND EXTRACT(HOUR FROM ((COALESCE(o."closedAt", o."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)) <= ${localHour}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ today: number; total30: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE ((o."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::date = ${today}::date)::int AS "today",
          COUNT(*) FILTER (WHERE ((o."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::date BETWEEN ${from30}::date AND ${yesterday}::date)::int AS "total30"
        FROM orders o WHERE o.status = 'CANCELLED'`,
      this.prisma.table.groupBy({
        by: ['status'],
        where: { deletedAt: null, isActive: true },
        _count: true,
      }),
      this.prisma.order.findMany({
        where: { status: 'DRAFT', deletedAt: null },
        select: {
          orderNumber: true,
          total: true,
          createdAt: true,
          kitchenStatus: true,
          table: { select: { number: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 60,
      }),
      this.flags.isEnabled('digital_kitchen'),
    ]);

    const rate = (discount: number, sales: number) =>
      sales + discount > 0 ? discount / (sales + discount) : 0;
    const sameDaySales = sameWeekday.map((row) => Number(row.sales));
    const baselineSales = sameDaySales.length
      ? sameDaySales.reduce((a, b) => a + b, 0) / sameDaySales.length
      : null;
    const days30 = Math.max(periodLengthDays(from30, yesterday), 1);
    const occupied = tables.find((t) => t.status === 'OCCUPIED')?._count ?? 0;
    const tablesTotal = tables.reduce((sum, t) => sum + t._count, 0);
    const minutes = (date: Date) =>
      Math.max(Math.round((now.getTime() - date.getTime()) / 60000), 0);

    return {
      generatedAt: now.toISOString(),
      localHour,
      salesToday: todaySummary.totalSales,
      ordersToday: todaySummary.totalOrders,
      baselineSales,
      discountRateToday: rate(
        todaySummary.totalDiscount,
        todaySummary.totalSales,
      ),
      discountRateBaseline: rate(history.totalDiscount, history.totalSales),
      cancelledToday: cancelled[0]?.today ?? 0,
      cancelledBaseline: (cancelled[0]?.total30 ?? 0) / days30,
      tablesOccupied: occupied,
      tablesTotal,
      openOrders: open.map((order) => ({
        orderNumber: order.orderNumber,
        table: String(order.table.number),
        minutesOpen: minutes(order.createdAt),
        total: Number(order.total),
      })),
      kitchenPending: kitchenOn
        ? open
            .filter((order) => order.kitchenStatus === 'PENDING')
            .map((order) => ({
              orderNumber: order.orderNumber,
              table: String(order.table.number),
              minutesWaiting: minutes(order.createdAt),
            }))
        : [],
    };
  }
}
