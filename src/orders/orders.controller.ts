import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  AddOrderItemDto,
  UpdateOrderItemDto,
  ChangeOrderStatusDto,
  ApplyDiscountDto,
  ListOrdersQueryDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Crea una nueva orden
   * Roles permitidos: WAITER, CASHIER, MANAGER, ADMINISTRATOR
   */
  @Post()
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.create(dto);
  }

  /**
   * Lista órdenes con filtros avanzados
   * Roles permitidos: WAITER, CASHIER, MANAGER, ADMINISTRATOR
   */
  @Get()
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async findAll(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  /**
   * Obtiene una orden por ID
   */
  @Get(':id')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async findById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  /**
   * Obtiene la orden activa (DRAFT) de una mesa específica
   * Retorna null si no hay orden abierta en esa mesa
   * Útil para UI: al entrar a una mesa, verificar si ya hay orden
   */
  @Get('table/:tableId/active')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async getActiveOrderByTable(@Param('tableId') tableId: string) {
    return this.ordersService.getActiveOrderByTable(tableId);
  }

  /**
   * Cambia el estado de una orden
   * Roles permitidos: CASHIER, MANAGER, ADMINISTRATOR
   */
  @Patch(':id/status')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.changeStatus(id, dto, user.sub);
  }

  /**
   * Añade un item a una orden
   * Roles permitidos: WAITER, CASHIER, MANAGER, ADMINISTRATOR
   */
  @Post(':id/items')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async addItem(
    @Param('id') id: string,
    @Body() dto: AddOrderItemDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.addItem(id, dto, user.sub);
  }

  /**
   * Elimina un item de una orden
   * Roles permitidos: WAITER, CASHIER, MANAGER, ADMINISTRATOR
   */
  @Delete(':id/items/:itemId')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.removeItem(id, itemId, user.sub);
  }

  /**
   * Actualiza la cantidad de un item en una orden (sin eliminar y re-crear)
   * Mantiene la posición y el ID del item
   * Roles permitidos: WAITER, CASHIER, MANAGER, ADMINISTRATOR
   */
  @Patch(':id/items/:itemId')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async updateItemQuantity(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.updateItemQuantity(id, itemId, dto, user.sub);
  }

  /**
   * Aplica un descuento a una orden
   * Roles permitidos: CASHIER, MANAGER, ADMINISTRATOR
   */
  @Patch(':id/discount')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async applyDiscount(
    @Param('id') id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.applyDiscount(id, dto, user.sub);
  }

  /**
   * Agrega propina a una orden
   * Roles permitidos: CASHIER, MANAGER, ADMINISTRATOR
   */
  @Patch(':id/tip')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async addTip(
    @Param('id') id: string,
    @Body('tipAmount') tipAmount: number,
    @CurrentUser() user: any,
  ) {
    if (tipAmount === undefined || tipAmount === null) {
      throw new BadRequestException('tipAmount es requerido');
    }
    return this.ordersService.addTip(id, tipAmount, user.sub);
  }

  /**
   * Obtiene estadísticas de ingresos
   * Roles permitidos: MANAGER, ADMINISTRATOR
   */
  @Get('stats/revenue')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getRevenueStats() {
    return this.ordersService.getRevenueStats();
  }

  /**
   * Obtiene órdenes agrupadas por estado
   * Roles permitidos: MANAGER, ADMINISTRATOR
   */
  @Get('stats/by-status')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getOrdersByStatus() {
    return this.ordersService.getOrdersByStatus();
  }

  /**
   * Obtiene órdenes agrupadas por tipo de servicio
   * Roles permitidos: MANAGER, ADMINISTRATOR
   */
  @Get('stats/by-service-type')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getOrdersByServiceType() {
    return this.ordersService.getOrdersByServiceType();
  }

  /**
   * Obtiene el historial completo de una orden
   * Incluye: quién hizo qué, cuándo, y metadata del cambio
   * Roles permitidos: WAITER, CASHIER, MANAGER, ADMINISTRATOR
   * Query params: page (default: 1), limit (default: 50, max: 500)
   */
  @Get(':id/history')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async getOrderHistory(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.ordersService.getOrderHistory(
      id,
      Math.max(1, parseInt(page) || 1),
      Math.max(1, Math.min(500, parseInt(limit) || 50)),
    );
  }

  /**
   * Obtiene timeline visual simplificado de una orden
   * Formato: emoji + acción legible, ideal para UI
   * Roles permitidos: WAITER, CASHIER, MANAGER, ADMINISTRATOR
   * Query params: page (default: 1), limit (default: 50, max: 500)
   */
  @Get(':id/history/timeline')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async getOrderHistoryTimeline(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.ordersService.getOrderHistoryTimeline(
      id,
      Math.max(1, parseInt(page) || 1),
      Math.max(1, Math.min(500, parseInt(limit) || 50)),
    );
  }
}
