import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersQueryService } from './application/orders-query.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const clampPage = (page: string) => Math.max(1, parseInt(page) || 1);
const clampLimit = (limit: string) =>
  Math.max(1, Math.min(500, parseInt(limit) || 50));

@Controller('api/admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminOrdersController {
  constructor(private readonly queries: OrdersQueryService) {}

  @Get(':id/history')
  @Roles('MANAGER', 'ADMINISTRATOR')
  getOrderHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.queries.getOrderHistory(id, clampPage(page), clampLimit(limit));
  }

  @Get(':id/history/timeline')
  @Roles('MANAGER', 'ADMINISTRATOR')
  getOrderHistoryTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.queries.getOrderHistoryTimeline(
      id,
      clampPage(page),
      clampLimit(limit),
    );
  }
}
