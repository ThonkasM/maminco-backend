import { paymentMethodLabel } from '../payments/domain/payment-method-label';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  businessDateOf,
  shiftLength,
  shiftOfMinute,
} from '../shifts/domain/shifts';
import { ShiftsService, type ShiftsConfig } from '../shifts/shifts.service';
import {
  DailySalesDto,
  TopProductDto,
  DailyReportDto,
  BreakdownDimension,
} from './dto';
import { buildUtcRange } from './report-range';
import { percentChange, previousPeriod } from '../insights/domain/period';
import type { ReportHeatmapCellDto } from './dto/daily-sales.dto';

export interface ReportSummaryDto extends DailySalesDto {
  from: string;
  to: string;
  totalItems: number;
  averageItemsPerOrder: number;
}

export interface ReportComparisonDto {
  current: ReportSummaryDto;
  previous: ReportSummaryDto;
  deltas: Record<
    | 'totalSales'
    | 'totalOrders'
    | 'averageOrderValue'
    | 'totalDiscount'
    | 'totalTips'
    | 'totalItems',
    number | null
  >;
}

export interface TimeSeriesPointDto {
  period: string;
  totalSales: number;
  totalOrders: number;
}

export interface BreakdownItemDto {
  key: string;
  label: string;
  totalSales: number;
  totalOrders: number;
  quantity?: number;
}

export interface ReportRange {
  from?: string;
  to?: string;
  areaId?: string;
  tableId?: string;
  shiftId?: string;
}

interface SummaryRow {
  totalOrders: number;
  totalSales: string;
  averageOrderValue: string;
  totalDiscount: string;
  totalTips: string;
  tableOrders: number;
  virtualOrders: number;
}

interface ItemsRow {
  totalItems: number;
}

interface SeriesRow {
  period: string;
  totalSales: string;
  totalOrders: number;
}

interface BreakdownRow {
  key: string;
  code?: string;
  label: string;
  totalSales: string;
  totalOrders: number;
  quantity?: number;
}

interface TopProductRow {
  productId: string;
  productName: string;
  categoryName: string;
  quantitySold: number;
  unitPrice: string | null;
  totalRevenue: string | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly shifts: ShiftsService,
  ) {}

  private get timeZone(): string {
    return this.config.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz';
  }

  /** Current business date (YYYY-MM-DD): the calendar date shifted by the business day start. */
  async businessToday(): Promise<string> {
    const { businessDayStartMinute } = await this.shifts.getConfig();
    return businessDateOf(new Date(), this.timeZone, businessDayStartMinute);
  }

  /** UTC bounds [start, end) of a business date (YYYY-MM-DD). */
  async businessDayBounds(date: string): Promise<{ start: Date; end: Date }> {
    const { businessDayStartMinute } = await this.shifts.getConfig();
    const bounds = buildUtcRange(date, date, this.timeZone);
    const offsetMs = businessDayStartMinute * 60_000;
    return {
      start: new Date(bounds.start.getTime() + offsetMs),
      end: new Date(bounds.end.getTime() + offsetMs),
    };
  }

  /** Local (business timezone) timestamp of an order's sale moment. */
  private localSale(): Prisma.Sql {
    return Prisma.sql`((COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${this.timeZone}::text)`;
  }

  private shiftClause(config: ShiftsConfig, shiftId: string): Prisma.Sql {
    const shift = config.shifts.find((item) => item.id === shiftId);
    if (!shift) return Prisma.sql`FALSE`;
    if (shiftLength(shift) >= 1440) return Prisma.sql`TRUE`;
    const local = this.localSale();
    const minute = Prisma.sql`(EXTRACT(HOUR FROM ${local})::int * 60 + EXTRACT(MINUTE FROM ${local})::int)`;
    return shift.endMinute > shift.startMinute
      ? Prisma.sql`(${minute} >= ${shift.startMinute}::int AND ${minute} < ${shift.endMinute}::int)`
      : Prisma.sql`(${minute} >= ${shift.startMinute}::int OR ${minute} < ${shift.endMinute}::int)`;
  }

  /**
   * Shared filter: closed sales within a range of business dates (inclusive), optionally
   * scoped to an area, a table or a shift. A business date D spans
   * [D + dayStart, D + 1 day + dayStart) in the business timezone. The sale moment is
   * `closedAt` (fallback `createdAt`).
   */
  private async whereClause(range: ReportRange): Promise<Prisma.Sql> {
    const config = await this.shifts.getConfig();
    const today = await this.businessToday();
    const from = range.from ?? today;
    const to = range.to ?? today;
    const bounds = buildUtcRange(from, to, this.timeZone);
    const offsetMs = config.businessDayStartMinute * 60_000;
    const start = new Date(bounds.start.getTime() + offsetMs);
    const end = new Date(bounds.end.getTime() + offsetMs);

    const parts: Prisma.Sql[] = [
      Prisma.sql`orders.status = 'CLOSED'`,
      Prisma.sql`((orders."closedAt" >= (${start}::timestamptz AT TIME ZONE 'UTC') AND orders."closedAt" < (${end}::timestamptz AT TIME ZONE 'UTC')) OR (orders."closedAt" IS NULL AND orders."createdAt" >= (${start}::timestamptz AT TIME ZONE 'UTC') AND orders."createdAt" < (${end}::timestamptz AT TIME ZONE 'UTC')))`,
    ];
    if (range.areaId) parts.push(Prisma.sql`areas.id = ${range.areaId}`);
    if (range.tableId) parts.push(Prisma.sql`tables.id = ${range.tableId}`);
    if (range.shiftId) parts.push(this.shiftClause(config, range.shiftId));

    return Prisma.join(parts, ' AND ');
  }

  async getSummary(range: ReportRange = {}): Promise<ReportSummaryDto> {
    const where = await this.whereClause(range);
    const today = await this.businessToday();

    const [salesRows, itemRows] = await Promise.all([
      this.prisma.$queryRaw<SummaryRow[]>`
                SELECT
                    COUNT(DISTINCT orders.id)::int AS "totalOrders",
                    COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)), 0)::text AS "totalSales",
                    COALESCE(CAST(AVG(orders.total) AS DECIMAL(10,2)), 0)::text AS "averageOrderValue",
                    COALESCE(CAST(SUM(orders."discountAmount") AS DECIMAL(10,2)), 0)::text AS "totalDiscount",
                    COALESCE(CAST(SUM(orders."tipAmount") AS DECIMAL(10,2)), 0)::text AS "totalTips",
                    COALESCE(SUM(CASE WHEN areas."isVirtual" = false THEN 1 ELSE 0 END), 0)::int AS "tableOrders",
                    COALESCE(SUM(CASE WHEN areas."isVirtual" = true THEN 1 ELSE 0 END), 0)::int AS "virtualOrders"
                FROM orders
                JOIN tables ON orders."tableId" = tables.id
                JOIN areas ON tables."areaId" = areas.id
                WHERE ${where}
            `,
      this.prisma.$queryRaw<ItemsRow[]>`
                SELECT COALESCE(SUM(order_items.quantity), 0)::int AS "totalItems"
                FROM order_items
                JOIN orders ON order_items."orderId" = orders.id
                JOIN tables ON orders."tableId" = tables.id
                JOIN areas ON tables."areaId" = areas.id
                WHERE ${where}
            `,
    ]);

    const sales: Partial<SummaryRow> = salesRows[0] ?? {};
    const totalOrders = Number(sales.totalOrders) || 0;
    const totalItems = Number(itemRows[0]?.totalItems) || 0;

    return {
      from: range.from ?? today,
      to: range.to ?? today,
      totalSales: Number(sales.totalSales) || 0,
      totalOrders,
      averageOrderValue: Number(sales.averageOrderValue) || 0,
      totalDiscount: Number(sales.totalDiscount) || 0,
      totalTips: Number(sales.totalTips) || 0,
      tableOrders: Number(sales.tableOrders) || 0,
      virtualOrders: Number(sales.virtualOrders) || 0,
      totalItems,
      averageItemsPerOrder:
        totalOrders > 0
          ? Math.round((totalItems / totalOrders) * 100) / 100
          : 0,
    };
  }

  async getComparison(
    range: ReportRange = {},
    previousRange?: { from: string; to: string },
  ): Promise<ReportComparisonDto> {
    const from = range.from ?? (await this.businessToday());
    const to = range.to ?? from;
    const before = previousRange ?? previousPeriod(from, to);
    const [current, previous] = await Promise.all([
      this.getSummary({ ...range, from, to }),
      this.getSummary({ ...range, from: before.from, to: before.to }),
    ]);
    const keys = [
      'totalSales',
      'totalOrders',
      'averageOrderValue',
      'totalDiscount',
      'totalTips',
      'totalItems',
    ] as const;
    const deltas = Object.fromEntries(
      keys.map((key) => [key, percentChange(current[key], previous[key])]),
    ) as ReportComparisonDto['deltas'];
    return { current, previous, deltas };
  }

  async getHeatmap(range: ReportRange = {}): Promise<ReportHeatmapCellDto[]> {
    const where = await this.whereClause(range);
    const tz = this.timeZone;
    const rows = await this.prisma.$queryRaw<
      {
        weekday: number;
        hour: number;
        totalSales: string;
        totalOrders: number;
      }[]
    >`
            SELECT
                EXTRACT(DOW FROM (COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::int AS "weekday",
                EXTRACT(HOUR FROM (COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::int AS "hour",
                COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)), 0)::text AS "totalSales",
                COUNT(DISTINCT orders.id)::int AS "totalOrders"
            FROM orders
            JOIN tables ON orders."tableId" = tables.id
            JOIN areas ON tables."areaId" = areas.id
            WHERE ${where}
            GROUP BY 1, 2
            ORDER BY 1, 2
        `;
    return rows.map((row) => ({
      weekday: row.weekday,
      hour: row.hour,
      totalSales: Number(row.totalSales) || 0,
      totalOrders: Number(row.totalOrders) || 0,
    }));
  }

  async getTimeSeries(
    range: ReportRange & { groupBy?: 'day' | 'week' | 'month' },
  ): Promise<TimeSeriesPointDto[]> {
    const unit = range.groupBy ?? 'day';
    const format = unit === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const where = await this.whereClause(range);
    const { businessDayStartMinute } = await this.shifts.getConfig();
    const local = this.localSale();

    const rows = await this.prisma.$queryRaw<SeriesRow[]>`
            SELECT
                to_char(
                    date_trunc(${unit}::text, ${local} - (${businessDayStartMinute}::int * INTERVAL '1 minute')),
                    ${format}::text
                ) AS "period",
                COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)), 0)::text AS "totalSales",
                COUNT(DISTINCT orders.id)::int AS "totalOrders"
            FROM orders
            JOIN tables ON orders."tableId" = tables.id
            JOIN areas ON tables."areaId" = areas.id
            WHERE ${where}
            GROUP BY 1
            ORDER BY 1
        `;

    return rows.map((row) => ({
      period: row.period,
      totalSales: Number(row.totalSales) || 0,
      totalOrders: Number(row.totalOrders) || 0,
    }));
  }

  async getBreakdown(
    range: ReportRange & { by: BreakdownDimension; limit?: number },
  ): Promise<BreakdownItemDto[]> {
    const where = await this.whereClause(range);
    const limit = range.limit ?? 20;
    const tz = this.timeZone;

    switch (range.by) {
      case 'area':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<BreakdownRow[]>`
                    SELECT areas.id AS "key", areas.name AS "label",
                        COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)),0)::text AS "totalSales",
                        COUNT(DISTINCT orders.id)::int AS "totalOrders"
                    FROM orders
                    JOIN tables ON orders."tableId" = tables.id
                    JOIN areas ON tables."areaId" = areas.id
                    WHERE ${where}
                    GROUP BY areas.id, areas.name
                    ORDER BY SUM(orders.total) DESC NULLS LAST
                    LIMIT ${limit}
                `,
        );

      case 'table':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<BreakdownRow[]>`
                    SELECT tables.id AS "key",
                        (areas.name || ' · Mesa ' || tables.number) AS "label",
                        COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)),0)::text AS "totalSales",
                        COUNT(DISTINCT orders.id)::int AS "totalOrders"
                    FROM orders
                    JOIN tables ON orders."tableId" = tables.id
                    JOIN areas ON tables."areaId" = areas.id
                    WHERE ${where}
                    GROUP BY tables.id, areas.name, tables.number
                    ORDER BY SUM(orders.total) DESC NULLS LAST
                    LIMIT ${limit}
                `,
        );

      case 'category':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<BreakdownRow[]>`
                    SELECT categories.id AS "key", categories.name AS "label",
                        COALESCE(CAST(SUM(order_items.subtotal) AS DECIMAL(10,2)),0)::text AS "totalSales",
                        COUNT(DISTINCT orders.id)::int AS "totalOrders",
                        COALESCE(SUM(order_items.quantity),0)::int AS "quantity"
                    FROM order_items
                    JOIN orders ON order_items."orderId" = orders.id
                    JOIN tables ON orders."tableId" = tables.id
                    JOIN areas ON tables."areaId" = areas.id
                    JOIN products ON order_items."productId" = products.id
                    JOIN categories ON products."categoryId" = categories.id
                    WHERE ${where}
                    GROUP BY categories.id, categories.name
                    ORDER BY SUM(order_items.subtotal) DESC NULLS LAST
                    LIMIT ${limit}
                `,
        );

      case 'paymentMethod':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<BreakdownRow[]>`
                    SELECT payment_methods.id AS "key", payment_methods.code AS "code", payment_methods.name AS "label",
                        COALESCE(CAST(SUM(payments."amountApplied") AS DECIMAL(10,2)),0)::text AS "totalSales",
                        COUNT(DISTINCT orders.id)::int AS "totalOrders"
                    FROM payments
                    JOIN payment_methods ON payments."paymentMethodId" = payment_methods.id
                    JOIN orders ON payments."orderId" = orders.id
                    JOIN tables ON orders."tableId" = tables.id
                    JOIN areas ON tables."areaId" = areas.id
                    WHERE ${where}
                    GROUP BY payment_methods.id, payment_methods.code, payment_methods.name
                    ORDER BY SUM(payments."amountApplied") DESC NULLS LAST
                    LIMIT ${limit}
                `,
        );

      case 'hour':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<BreakdownRow[]>`
                    SELECT to_char(date_trunc('hour', (COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text), 'HH24:00') AS "key",
                        to_char(date_trunc('hour', (COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text), 'HH24:00') AS "label",
                        COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)),0)::text AS "totalSales",
                        COUNT(DISTINCT orders.id)::int AS "totalOrders"
                    FROM orders
                    JOIN tables ON orders."tableId" = tables.id
                    JOIN areas ON tables."areaId" = areas.id
                    WHERE ${where}
                    GROUP BY 1, 2
                    ORDER BY 1
                    LIMIT ${limit}
                `,
        );

      case 'waiter':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<BreakdownRow[]>`
                    SELECT users.id AS "key", users.name AS "label",
                        COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)),0)::text AS "totalSales",
                        COUNT(DISTINCT orders.id)::int AS "totalOrders"
                    FROM orders
                    JOIN users ON orders."createdById" = users.id
                    JOIN tables ON orders."tableId" = tables.id
                    JOIN areas ON tables."areaId" = areas.id
                    WHERE ${where}
                    GROUP BY users.id, users.name
                    ORDER BY SUM(orders.total) DESC NULLS LAST
                    LIMIT ${limit}
                `,
        );

      case 'shift':
        return this.shiftBreakdown(where);

      default:
        return [];
    }
  }

  /** Sales per configured shift, from per-minute totals (each order falls in exactly one minute). */
  private async shiftBreakdown(where: Prisma.Sql): Promise<BreakdownItemDto[]> {
    const { shifts } = await this.shifts.getConfig();
    const local = this.localSale();
    const rows = await this.prisma.$queryRaw<
      { minute: number; totalSales: string; totalOrders: number }[]
    >`
            SELECT
                (EXTRACT(HOUR FROM ${local})::int * 60 + EXTRACT(MINUTE FROM ${local})::int) AS "minute",
                COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)),0)::text AS "totalSales",
                COUNT(DISTINCT orders.id)::int AS "totalOrders"
            FROM orders
            JOIN tables ON orders."tableId" = tables.id
            JOIN areas ON tables."areaId" = areas.id
            WHERE ${where}
            GROUP BY 1
        `;
    const totals = new Map(
      shifts.map((shift) => [shift.id, { sales: 0, orders: 0 }]),
    );
    for (const row of rows) {
      const shift = shiftOfMinute(shifts, Number(row.minute));
      const bucket = shift ? totals.get(shift.id) : undefined;
      if (!bucket) continue;
      bucket.sales += Number(row.totalSales) || 0;
      bucket.orders += Number(row.totalOrders) || 0;
    }
    return shifts.map((shift) => {
      const bucket = totals.get(shift.id) ?? { sales: 0, orders: 0 };
      return {
        key: shift.id,
        label: shift.name,
        totalSales: Math.round(bucket.sales * 100) / 100,
        totalOrders: bucket.orders,
      };
    });
  }

  private mapBreakdown(rows: BreakdownRow[]): BreakdownItemDto[] {
    return rows.map((row) => ({
      key: row.key,
      label: row.code ? paymentMethodLabel(row.code, row.label) : row.label,
      totalSales: Number(row.totalSales) || 0,
      totalOrders: Number(row.totalOrders) || 0,
      quantity: row.quantity !== undefined ? Number(row.quantity) : undefined,
    }));
  }

  async getTopProducts(
    range: ReportRange & { limit?: number },
  ): Promise<TopProductDto[]> {
    const where = await this.whereClause(range);
    const limit = range.limit ?? 10;

    const rows = await this.prisma.$queryRaw<TopProductRow[]>`
            SELECT
                products.id AS "productId",
                products.name AS "productName",
                categories.name AS "categoryName",
                COALESCE(SUM(order_items.quantity), 0)::int AS "quantitySold",
                CAST(AVG(order_items."unitPrice") AS DECIMAL(10,2))::text AS "unitPrice",
                CAST(SUM(order_items.subtotal) AS DECIMAL(10,2))::text AS "totalRevenue"
            FROM order_items
            JOIN products ON order_items."productId" = products.id
            JOIN categories ON products."categoryId" = categories.id
            JOIN orders ON order_items."orderId" = orders.id
            JOIN tables ON orders."tableId" = tables.id
            JOIN areas ON tables."areaId" = areas.id
            WHERE ${where}
            GROUP BY products.id, products.name, categories.name
            ORDER BY "quantitySold" DESC
            LIMIT ${limit}
        `;

    return rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      categoryName: row.categoryName,
      quantitySold: Number(row.quantitySold) || 0,
      unitPrice: row.unitPrice ? Number(row.unitPrice) : 0,
      totalRevenue: row.totalRevenue ? Number(row.totalRevenue) : 0,
    }));
  }

  async getTodaySales(): Promise<DailySalesDto> {
    return this.getSummary();
  }

  async getTodayTopProducts(limit: number = 10): Promise<TopProductDto[]> {
    return this.getTopProducts({ limit });
  }

  async getDailyReport(limit: number = 10): Promise<DailyReportDto> {
    const sales = await this.getSummary();
    const topProducts = await this.getTopProducts({ limit });
    return { date: new Date(), sales, topProducts };
  }
}
