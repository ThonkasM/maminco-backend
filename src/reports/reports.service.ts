import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DailySalesDto,
  TopProductDto,
  DailyReportDto,
  BreakdownDimension,
} from './dto';

export interface ReportSummaryDto extends DailySalesDto {
  from: string;
  to: string;
  totalItems: number;
  averageItemsPerOrder: number;
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
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz';
  }

  /** Today's date (YYYY-MM-DD) in the business timezone. */
  private today(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /**
   * Shared filter: closed sales within a date range (inclusive, in the business
   * timezone), optionally scoped to an area or a table. The sale moment is
   * `closedAt` (fallback `createdAt`).
   */
  private whereClause(range: ReportRange): Prisma.Sql {
    const tz = this.timeZone;
    const from = range.from ?? this.today();
    const to = range.to ?? this.today();

    const parts: Prisma.Sql[] = [
      Prisma.sql`orders.status = 'CLOSED'`,
      Prisma.sql`(COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE ${tz}::text)::date BETWEEN ${from}::date AND ${to}::date`,
    ];
    if (range.areaId) parts.push(Prisma.sql`areas.id::text = ${range.areaId}`);
    if (range.tableId)
      parts.push(Prisma.sql`tables.id::text = ${range.tableId}`);

    return Prisma.join(parts, ' AND ');
  }

  /**
   * Resumen agregado del rango (ventas, órdenes, ticket, descuentos, propinas,
   * mesas virtuales/físicas, ítems).
   */
  async getSummary(range: ReportRange = {}): Promise<ReportSummaryDto> {
    const where = this.whereClause(range);

    const [salesRows, itemRows] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
                SELECT
                    COUNT(DISTINCT orders.id)::int AS "totalOrders",
                    COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)), 0)::text AS "totalSales",
                    COALESCE(CAST(AVG(orders.total) AS DECIMAL(10,2)), 0)::text AS "averageOrderValue",
                    COALESCE(CAST(SUM(orders."discountAmount") AS DECIMAL(10,2)), 0)::text AS "totalDiscount",
                    COALESCE(CAST(SUM(orders."tipAmount") AS DECIMAL(10,2)), 0)::text AS "totalTips",
                    COALESCE(SUM(CASE WHEN areas."isVirtual" = false THEN 1 ELSE 0 END), 0)::int AS "mesaOrders",
                    COALESCE(SUM(CASE WHEN areas."isVirtual" = true THEN 1 ELSE 0 END), 0)::int AS "virtualOrders"
                FROM orders
                JOIN tables ON orders."tableId" = tables.id
                JOIN areas ON tables."areaId" = areas.id
                WHERE ${where}
            `,
      this.prisma.$queryRaw<any[]>`
                SELECT COALESCE(SUM(order_items.quantity), 0)::int AS "totalItems"
                FROM order_items
                JOIN orders ON order_items."orderId" = orders.id
                JOIN tables ON orders."tableId" = tables.id
                JOIN areas ON tables."areaId" = areas.id
                WHERE ${where}
            `,
    ]);

    const sales = salesRows[0] ?? {};
    const totalOrders = Number(sales.totalOrders) || 0;
    const totalItems = Number(itemRows[0]?.totalItems) || 0;

    return {
      from: range.from ?? this.today(),
      to: range.to ?? this.today(),
      totalSales: Number(sales.totalSales) || 0,
      totalOrders,
      averageOrderValue: Number(sales.averageOrderValue) || 0,
      totalDiscount: Number(sales.totalDiscount) || 0,
      totalTips: Number(sales.totalTips) || 0,
      mesaOrders: Number(sales.mesaOrders) || 0,
      virtualOrders: Number(sales.virtualOrders) || 0,
      totalItems,
      averageItemsPerOrder:
        totalOrders > 0
          ? Math.round((totalItems / totalOrders) * 100) / 100
          : 0,
    };
  }

  /** Serie temporal de ventas por día/semana/mes. */
  async getTimeSeries(
    range: ReportRange & { groupBy?: 'day' | 'week' | 'month' },
  ): Promise<TimeSeriesPointDto[]> {
    const unit = range.groupBy ?? 'day';
    const format = unit === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const where = this.whereClause(range);
    const tz = this.timeZone;

    const rows = await this.prisma.$queryRaw<any[]>`
            SELECT
                to_char(
                    date_trunc(${unit}::text, COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE ${tz}::text),
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

  /** Desglose por dimensión: área, mesa, categoría, método de pago, hora o mesero. */
  async getBreakdown(
    range: ReportRange & { by: BreakdownDimension; limit?: number },
  ): Promise<BreakdownItemDto[]> {
    const where = this.whereClause(range);
    const limit = range.limit ?? 20;
    const tz = this.timeZone;

    switch (range.by) {
      case 'area':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<any[]>`
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
          await this.prisma.$queryRaw<any[]>`
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
          await this.prisma.$queryRaw<any[]>`
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
          await this.prisma.$queryRaw<any[]>`
                    SELECT payment_methods.id AS "key", payment_methods.name AS "label",
                        COALESCE(CAST(SUM(payments."amountApplied") AS DECIMAL(10,2)),0)::text AS "totalSales",
                        COUNT(DISTINCT orders.id)::int AS "totalOrders"
                    FROM payments
                    JOIN payment_methods ON payments."paymentMethodId" = payment_methods.id
                    JOIN orders ON payments."orderId" = orders.id
                    JOIN tables ON orders."tableId" = tables.id
                    JOIN areas ON tables."areaId" = areas.id
                    WHERE ${where}
                    GROUP BY payment_methods.id, payment_methods.name
                    ORDER BY SUM(payments."amountApplied") DESC NULLS LAST
                    LIMIT ${limit}
                `,
        );

      case 'hour':
        return this.mapBreakdown(
          await this.prisma.$queryRaw<any[]>`
                    SELECT to_char(date_trunc('hour', COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE ${tz}::text), 'HH24:00') AS "key",
                        to_char(date_trunc('hour', COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE ${tz}::text), 'HH24:00') AS "label",
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
          await this.prisma.$queryRaw<any[]>`
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

      default:
        return [];
    }
  }

  private mapBreakdown(rows: any[]): BreakdownItemDto[] {
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      totalSales: Number(row.totalSales) || 0,
      totalOrders: Number(row.totalOrders) || 0,
      quantity: row.quantity !== undefined ? Number(row.quantity) : undefined,
    }));
  }

  /** Productos más vendidos en el rango. */
  async getTopProducts(
    range: ReportRange & { limit?: number },
  ): Promise<TopProductDto[]> {
    const where = this.whereClause(range);
    const limit = range.limit ?? 10;

    const rows = await this.prisma.$queryRaw<any[]>`
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

  // ---------------------------------------------------------------------------
  // Backwards-compatible "today" helpers (dashboard).
  // ---------------------------------------------------------------------------

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
