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
   * Roles permitidos: MESERO, CAJERO, GERENTE, ADMINISTRADOR
   */
  @Post()
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.create(dto);
  }

  /**
   * Lista órdenes con filtros avanzados
   * Roles permitidos: MESERO, CAJERO, GERENTE, ADMINISTRADOR
   */
  @Get()
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async findAll(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  /**
   * Obtiene una orden por ID
   */
  @Get(':id')
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async findById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  /**
   * Obtiene la orden activa (BORRADOR) de una mesa específica
   * Retorna null si no hay orden abierta en esa mesa
   * Útil para UI: al entrar a una mesa, verificar si ya hay orden
   */
  @Get('table/:tableId/active')
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async getActiveOrderByTable(@Param('tableId') tableId: string) {
    return this.ordersService.getActiveOrderByTable(tableId);
  }

  /**
   * Cambia el estado de una orden
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR
   */
  @Patch(':id/status')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.changeStatus(id, dto, user.sub);
  }

  /**
   * Añade un item a una orden
   * Roles permitidos: MESERO, CAJERO, GERENTE, ADMINISTRADOR
   */
  @Post(':id/items')
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async addItem(
    @Param('id') id: string,
    @Body() dto: AddOrderItemDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.addItem(id, dto, user.sub);
  }

  /**
   * Elimina un item de una orden
   * Roles permitidos: MESERO, CAJERO, GERENTE, ADMINISTRADOR
   */
  @Delete(':id/items/:itemId')
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
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
   * Roles permitidos: MESERO, CAJERO, GERENTE, ADMINISTRADOR
   */
  @Patch(':id/items/:itemId')
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
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
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR
   */
  @Patch(':id/discount')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async applyDiscount(
    @Param('id') id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.applyDiscount(id, dto, user.sub);
  }

  /**
   * Agrega propina a una orden
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR
   */
  @Patch(':id/tip')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
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
   * Roles permitidos: GERENTE, ADMINISTRADOR
   */
  @Get('stats/revenue')
  @Roles('GERENTE', 'ADMINISTRADOR')
  async getRevenueStats() {
    return this.ordersService.getRevenueStats();
  }

  /**
   * Obtiene órdenes agrupadas por estado
   * Roles permitidos: GERENTE, ADMINISTRADOR
   */
  @Get('stats/by-status')
  @Roles('GERENTE', 'ADMINISTRADOR')
  async getOrdersByStatus() {
    return this.ordersService.getOrdersByStatus();
  }

  /**
   * Obtiene órdenes agrupadas por tipo de servicio
   * Roles permitidos: GERENTE, ADMINISTRADOR
   */
  @Get('stats/by-service-type')
  @Roles('GERENTE', 'ADMINISTRADOR')
  async getOrdersByServiceType() {
    return this.ordersService.getOrdersByServiceType();
  }

  /**
   * Obtiene el historial completo de una orden
   * Incluye: quién hizo qué, cuándo, y metadata del cambio
   * Roles permitidos: MESERO, CAJERO, GERENTE, ADMINISTRADOR
   * Query params: page (default: 1), limit (default: 50, max: 500)
   */
  @Get(':id/history')
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
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
   * Roles permitidos: MESERO, CAJERO, GERENTE, ADMINISTRADOR
   * Query params: page (default: 1), limit (default: 50, max: 500)
   */
  @Get(':id/history/timeline')
  @Roles('MESERO', 'CAJERO', 'GERENTE', 'ADMINISTRADOR')
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
