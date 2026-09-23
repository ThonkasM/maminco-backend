import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SystemService } from './system.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

class LogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;

  @IsOptional()
  @IsIn(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'])
  level?: 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

@Controller('api/system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER')
  getStatus() {
    return this.systemService.getStatus();
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  async getLogs(@Query() query: LogsQueryDto) {
    const [result, stats] = await Promise.all([
      this.systemService.getLogs({
        limit: query.limit ?? 100,
        level: query.level,
        since: query.since ? new Date(query.since) : undefined,
        search: query.search,
      }),
      this.systemService.getLogStats(),
    ]);
    return { ...result, retentionDays: stats.retentionDays };
  }

  @Get('logs/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  getLogStats() {
    return this.systemService.getLogStats();
  }

  @Post('logs/prune')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  pruneLogs() {
    return this.systemService.pruneLogs();
  }

  @Get('config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  getConfig() {
    return this.systemService.getConfig();
  }
}
