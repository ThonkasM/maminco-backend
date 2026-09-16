import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) { }

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Obtiene estadísticas básicas de la base de datos
   */
  async getDbStats() {
    const [users, categories, products, areas, tables, orders] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.category.count(),
      this.prisma.product.count(),
      this.prisma.area.count(),
      this.prisma.table.count(),
      this.prisma.order.count(),
    ]);

    return {
      message: 'Database Statistics',
      stats: {
        users,
        categories,
        products,
        areas,
        tables,
        orders,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

