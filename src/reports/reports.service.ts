import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DailySalesDto, TopProductDto, DailyReportDto } from './dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Business timezone used to define the "day" for reports. */
  private get timeZone(): string {
    return this.config.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz';
  }

  /**
   * Obtiene las ventas del día actual.
   *
   * El "día" se define en la zona horaria del negocio y el momento de venta es
   * `closedAt` (con `createdAt` como respaldo). Las columnas se aliasan entre
   * comillas para conservar camelCase (Postgres pliega identificadores sin
   * comillas a minúsculas).
   */
  async getTodaySales(): Promise<DailySalesDto> {
    const timeZone = this.timeZone;

    const result = await this.prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)), 0)::text AS "totalSales",
                COALESCE(COUNT(DISTINCT orders.id), 0)::int AS "totalOrders",
                COALESCE(CAST(AVG(orders.total) AS DECIMAL(10,2)), 0)::text AS "averageOrderValue",
                COALESCE(CAST(SUM(orders."discountAmount") AS DECIMAL(10,2)), 0)::text AS "totalDiscount",
                COALESCE(CAST(SUM(orders."tipAmount") AS DECIMAL(10,2)), 0)::text AS "totalTips",
                COALESCE(SUM(CASE WHEN areas."isVirtual" = false THEN 1 ELSE 0 END), 0)::int AS "mesaOrders",
                COALESCE(SUM(CASE WHEN areas."isVirtual" = true THEN 1 ELSE 0 END), 0)::int AS "virtualOrders"
            FROM orders
            JOIN tables ON orders."tableId" = tables.id
            JOIN areas ON tables."areaId" = areas.id
            WHERE orders.status = 'CLOSED'
                AND (COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE ${timeZone})::date
                    = (now() AT TIME ZONE ${timeZone})::date
        `;

    const data = result[0] ?? {};

    return {
      totalSales: data.totalSales ? Number(data.totalSales) : 0,
      totalOrders: Number(data.totalOrders) || 0,
      averageOrderValue: data.averageOrderValue
        ? Number(data.averageOrderValue)
        : 0,
      totalDiscount: data.totalDiscount ? Number(data.totalDiscount) : 0,
      totalTips: data.totalTips ? Number(data.totalTips) : 0,
      mesaOrders: Number(data.mesaOrders) || 0,
      virtualOrders: Number(data.virtualOrders) || 0,
    };
  }

  /**
   * Obtiene los productos más vendidos del día
   */
  async getTodayTopProducts(limit: number = 10): Promise<TopProductDto[]> {
    const timeZone = this.timeZone;

    const results = await this.prisma.$queryRaw<any[]>`
            SELECT
                products.id AS "productId",
                products.name AS "productName",
                categories.name AS "categoryName",
                SUM(order_items.quantity)::int AS "quantitySold",
                CAST(AVG(order_items."unitPrice") AS DECIMAL(10,2))::text AS "unitPrice",
                CAST(SUM(order_items.subtotal) AS DECIMAL(10,2))::text AS "totalRevenue"
            FROM order_items
            JOIN products ON order_items."productId" = products.id
            JOIN categories ON products."categoryId" = categories.id
            JOIN orders ON order_items."orderId" = orders.id
            WHERE orders.status = 'CLOSED'
                AND (COALESCE(orders."closedAt", orders."createdAt") AT TIME ZONE ${timeZone})::date
                    = (now() AT TIME ZONE ${timeZone})::date
            GROUP BY products.id, products.name, categories.name
            ORDER BY "quantitySold" DESC
            LIMIT ${limit}
        `;

    return results.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      categoryName: row.categoryName,
      quantitySold: Number(row.quantitySold) || 0,
      unitPrice: row.unitPrice ? Number(row.unitPrice) : 0,
      totalRevenue: row.totalRevenue ? Number(row.totalRevenue) : 0,
    }));
  }

  /**
   * Obtiene el reporte diario completo (ventas del día + top productos)
   */
  async getDailyReport(limit: number = 10): Promise<DailyReportDto> {
    const sales = await this.getTodaySales();
    const topProducts = await this.getTodayTopProducts(limit);

    return {
      date: new Date(),
      sales,
      topProducts,
    };
  }
}
