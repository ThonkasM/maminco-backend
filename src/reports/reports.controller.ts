import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import {
  ReportRangeQueryDto,
  ReportTimeSeriesQueryDto,
  ReportBreakdownQueryDto,
  ReportTopProductsQueryDto,
} from './dto';

@Controller('api/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Reporte dinámico de un rango de fechas (por defecto: hoy), con filtros
   * opcionales por área y mesa.
   */
  @Get('summary')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getSummary(@Query() query: ReportRangeQueryDto) {
    const data = await this.reportsService.getSummary(query);
    return { status: 'success', data };
  }

  /** Serie temporal de ventas (por día, semana o mes). */
  @Get('timeseries')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getTimeSeries(@Query() query: ReportTimeSeriesQueryDto) {
    const data = await this.reportsService.getTimeSeries(query);
    return { status: 'success', data };
  }

  /** Desglose por área, mesa, categoría, método de pago, hora o mesero. */
  @Get('breakdown')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getBreakdown(@Query() query: ReportBreakdownQueryDto) {
    const data = await this.reportsService.getBreakdown(query);
    return { status: 'success', data, count: data.length };
  }

  /** Productos más vendidos en el rango. */
  @Get('top-products')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getTopProducts(@Query() query: ReportTopProductsQueryDto) {
    const data = await this.reportsService.getTopProducts(query);
    return { status: 'success', data, count: data.length };
  }

  // ---- Backwards-compatible "today" endpoints (dashboard) ----

  @Get('today/sales')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getTodaySales() {
    const data = await this.reportsService.getTodaySales();
    return { status: 'success', data };
  }

  @Get('today/top-products')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getTodayTopProducts(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    const data = await this.reportsService.getTodayTopProducts(limitNum);
    return { status: 'success', data, count: data.length };
  }

  @Get('today')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getDailyReport(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit) : 10;
    const data = await this.reportsService.getDailyReport(limitNum);
    return { status: 'success', data };
  }
}
