import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

class ForecastQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  horizon?: number = 7;
}

class ProductForecastQueryDto extends ForecastQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

@Controller('api/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('health')
  @Roles('ADMINISTRATOR', 'MANAGER')
  getHealth() {
    return this.aiService.getHealth();
  }

  @Get('forecast/sales')
  @Roles('ADMINISTRATOR', 'MANAGER')
  getSalesForecast(@Query() query: ForecastQueryDto) {
    return this.aiService.getSalesForecast(query.horizon ?? 7);
  }

  @Get('forecast/products')
  @Roles('ADMINISTRATOR', 'MANAGER')
  getProductForecast(@Query() query: ProductForecastQueryDto) {
    return this.aiService.getProductForecast(
      query.horizon ?? 7,
      query.limit ?? 20,
    );
  }

  @Get('forecast/peak-hours')
  @Roles('ADMINISTRATOR', 'MANAGER')
  getPeakHours() {
    return this.aiService.getPeakHours();
  }

  @Get('insights/anomalies')
  @Roles('ADMINISTRATOR', 'MANAGER')
  getAnomalies() {
    return this.aiService.getAnomalies();
  }

  @Get('metrics/summary')
  @Roles('ADMINISTRATOR', 'MANAGER')
  getMetricsSummary() {
    return this.aiService.getMetricsSummary();
  }

  @Post('train')
  @Roles('ADMINISTRATOR')
  retrain() {
    return this.aiService.retrain();
  }
}
