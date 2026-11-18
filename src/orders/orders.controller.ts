import type { AuthUser } from '../auth/auth-user';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AddOrderItemDto,
  ApplyDiscountDto,
  AuditOrdersQueryDto,
  ChangeOrderStatusDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  UpdateKitchenStatusDto,
  UpdateOrderItemDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrdersQueryService } from './application/orders-query.service';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { ChangeOrderStatusUseCase } from './application/use-cases/change-order-status.use-case';
import { ChangeKitchenStatusUseCase } from './application/use-cases/change-kitchen-status.use-case';
import { AddOrderItemUseCase } from './application/use-cases/add-order-item.use-case';
import { RemoveOrderItemUseCase } from './application/use-cases/remove-order-item.use-case';
import { UpdateOrderItemUseCase } from './application/use-cases/update-order-item.use-case';
import { ApplyDiscountUseCase } from './application/use-cases/apply-discount.use-case';
import { AddTipUseCase } from './application/use-cases/add-tip.use-case';

const clampPage = (page: string) => Math.max(1, parseInt(page) || 1);
const clampLimit = (limit: string) =>
  Math.max(1, Math.min(500, parseInt(limit) || 50));

@Controller('api/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(
    private readonly queries: OrdersQueryService,
    private readonly createOrder: CreateOrderUseCase,
    private readonly changeStatus: ChangeOrderStatusUseCase,
    private readonly changeKitchenStatus: ChangeKitchenStatusUseCase,
    private readonly addItem: AddOrderItemUseCase,
    private readonly removeItem: RemoveOrderItemUseCase,
    private readonly updateItem: UpdateOrderItemUseCase,
    private readonly applyDiscount: ApplyDiscountUseCase,
    private readonly addTip: AddTipUseCase,
  ) {}

  @Post()
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.createOrder.execute(dto, user?.id ?? user?.sub);
  }

  @Get()
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR', 'COOK')
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.queries.findAll(query);
  }

  @Get('audit')
  @Roles('MANAGER', 'ADMINISTRATOR')
  audit(@Query() query: AuditOrdersQueryDto) {
    return this.queries.audit(query);
  }

  @Get('kitchen')
  @Roles('COOK', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  findKitchenOrders() {
    return this.queries.getKitchenOrders();
  }

  @Get(':id')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR', 'COOK')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.queries.findById(id);
  }

  @Get('table/:tableId/active')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  getActiveOrderByTable(@Param('tableId', ParseUUIDPipe) tableId: string) {
    return this.queries.getActiveOrderByTable(tableId);
  }

  @Patch(':id/status')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.changeStatus.execute(id, dto, user.sub);
  }

  @Patch(':id/kitchen-status')
  @Roles('COOK', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  updateKitchenStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKitchenStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.changeKitchenStatus.execute(id, dto, user.sub);
  }

  @Post(':id/items')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  postItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrderItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.addItem.execute(id, dto, user.sub);
  }

  @Delete(':id/items/:itemId')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  deleteItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.removeItem.execute(id, itemId, {
      id: user.sub,
      role: user.role,
    });
  }

  @Patch(':id/items/:itemId')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  patchItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.updateItem.execute(id, itemId, dto, {
      id: user.sub,
      role: user.role,
    });
  }

  @Patch(':id/discount')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  patchDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.applyDiscount.execute(id, dto, user.sub);
  }

  @Patch(':id/tip')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  patchTip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tipAmount') tipAmount: number,
    @CurrentUser() user: AuthUser,
  ) {
    if (tipAmount === undefined || tipAmount === null) {
      throw new BadRequestException('tipAmount es requerido');
    }
    return this.addTip.execute(id, tipAmount, user.sub);
  }

  @Get('stats/revenue')
  @Roles('MANAGER', 'ADMINISTRATOR')
  getRevenueStats() {
    return this.queries.getRevenueStats();
  }

  @Get('stats/by-status')
  @Roles('MANAGER', 'ADMINISTRATOR')
  getOrdersByStatus() {
    return this.queries.getOrdersByStatus();
  }

  @Get('stats/by-service-type')
  @Roles('MANAGER', 'ADMINISTRATOR')
  getOrdersByServiceType() {
    return this.queries.getOrdersByServiceType();
  }

  @Get(':id/history')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  getOrderHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.queries.getOrderHistory(id, clampPage(page), clampLimit(limit));
  }

  @Get(':id/history/timeline')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
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
