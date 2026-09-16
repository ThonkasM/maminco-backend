import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DailySalesDto, TopProductDto, DailyReportDto } from './dto';

@Injectable()
export class ReportsService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Obtiene las ventas del día actual
     */
    async getTodaySales(): Promise<DailySalesDto> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayString = today.toISOString().split('T')[0];

        const result = await this.prisma.$queryRaw<any[]>`
            SELECT 
                COALESCE(CAST(SUM(orders.total) AS DECIMAL(10,2)), 0)::text as totalSales,
                COALESCE(COUNT(DISTINCT orders.id), 0) as totalOrders,
                COALESCE(CAST(AVG(orders.total) AS DECIMAL(10,2)), 0)::text as averageOrderValue,
                COALESCE(CAST(SUM(orders."discountAmount") AS DECIMAL(10,2)), 0)::text as totalDiscount,
                COALESCE(CAST(SUM(orders."tipAmount") AS DECIMAL(10,2)), 0)::text as totalTips,
                COALESCE(SUM(CASE WHEN areas."isVirtual" = false THEN 1 ELSE 0 END), 0) as mesaOrders,
                COALESCE(SUM(CASE WHEN areas."isVirtual" = true THEN 1 ELSE 0 END), 0) as virtualOrders
            FROM orders
            JOIN tables ON orders."tableId" = tables.id
            JOIN areas ON tables."areaId" = areas.id
            WHERE orders.status = 'CERRADO'
                AND DATE(orders."createdAt") = ${todayString}::date
        `;

        const data = result[0] || {};

        return {
            totalSales: data.totalSales ? Number(data.totalSales) : 0,
            totalOrders: Number(data.totalOrders) || 0,
            averageOrderValue: data.averageOrderValue ? Number(data.averageOrderValue) : 0,
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayString = today.toISOString().split('T')[0];

        const results = await this.prisma.$queryRaw<any[]>`
            SELECT 
                products.id,
                products.name as productName,
                categories.name as categoryName,
                SUM(order_items.quantity) as totalQuantity,
                CAST(AVG(order_items."unitPrice") AS DECIMAL(10,2))::text as unitPrice,
                CAST(SUM(order_items.subtotal) AS DECIMAL(10,2))::text as totalRevenue
            FROM order_items
            JOIN products ON order_items."productId" = products.id
            JOIN categories ON products."categoryId" = categories.id
            JOIN orders ON order_items."orderId" = orders.id
            WHERE orders.status = 'CERRADO'
                AND DATE(orders."createdAt") = ${todayString}::date
            GROUP BY products.id, products.name, categories.name
            ORDER BY totalQuantity DESC
            LIMIT ${limit}
        `;

        return results.map(row => ({
            productId: row.id,
            productName: row.productName,
            categoryName: row.categoryName,
            quantitySold: Number(row.totalQuantity) || 0,
            unitPrice: row.unitPrice ? Number(row.unitPrice) : 0,
            totalRevenue: row.totalRevenue ? Number(row.totalRevenue) : 0,
        }));
    }

    /**
     * Obtiene el reporte diario completo (ventas del día + top productos)
     */
    async getDailyReport(limit: number = 10): Promise<DailyReportDto> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sales = await this.getTodaySales();
        const topProducts = await this.getTodayTopProducts(limit);

        return {
            date: today,
            sales,
            topProducts,
        };
    }
}
