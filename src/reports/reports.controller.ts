import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';

@Controller('api/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /api/reports/today/sales
   * Obtiene las ventas del día actual
   */
  @Get('today/sales')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getTodaySales() {
    const data = await this.reportsService.getTodaySales();

    return {
      status: 'success',
      data,
    };
  }

  /**
   * GET /api/reports/today/top-products
   * Obtiene los productos más vendidos del día
   *
   * Query params:
   * - limit: number (default: 10) - Cantidad de productos a retornar
   */
  @Get('today/top-products')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getTodayTopProducts(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    const data = await this.reportsService.getTodayTopProducts(limitNum);

    return {
      status: 'success',
      data,
      count: data.length,
    };
  }

  /**
   * GET /api/reports/today
   * Obtiene el reporte diario completo (ventas + top productos)
   *
   * Query params:
   * - limit: number (default: 10) - Cantidad de productos a retornar
   */
  @Get('today')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getDailyReport(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    const data = await this.reportsService.getDailyReport(limitNum);

    return {
      status: 'success',
      data,
    };
  }
}
