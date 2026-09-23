import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaymentMethodsService } from './payment-methods.service';
import { CashDenominationsService } from './cash-denominations.service';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  PaymentMethodResponseDto,
  CreateCashDenominationDto,
  UpdateCashDenominationDto,
  CashDenominationResponseDto,
} from './dto';

/**
 * Controlador para administración de métodos de pago y denominaciones de efectivo
 * Solo accesible para ADMINISTRADOR y GERENTE
 */
@Controller('api/admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminPaymentController {
  constructor(
    private paymentMethodsService: PaymentMethodsService,
    private cashDenominationsService: CashDenominationsService,
  ) {}

  /**
   * ===================================
   * MÉTODOS DE PAGO
   * ===================================
   */

  /**
   * GET /api/admin/payments/methods
   * Listar todos los métodos de pago
   */
  @Get('methods')
  @Roles('ADMINISTRADOR', 'GERENTE')
  async listPaymentMethods(
    @Query('includeInactive') includeInactive?: boolean,
  ): Promise<PaymentMethodResponseDto[]> {
    return this.paymentMethodsService.findAll(includeInactive);
  }

  /**
   * POST /api/admin/payments/methods
   * Crear nuevo método de pago
   *
   * Body:
   * {
   *   "name": "EFECTIVO",
   *   "code": "CASH",
   *   "description": "Pago en efectivo",
   *   "isActive": true
   * }
   */
  @Post('methods')
  @Roles('ADMINISTRADOR')
  async createPaymentMethod(
    @Body() dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.create(dto);
  }

  /**
   * GET /api/admin/payments/methods/:id
   * Obtener método de pago por ID
   */
  @Get('methods/:id')
  @Roles('ADMINISTRADOR', 'GERENTE')
  async getPaymentMethod(
    @Param('id') id: string,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.findById(id);
  }

  /**
   * PATCH /api/admin/payments/methods/:id
   * Actualizar método de pago
   */
  @Patch('methods/:id')
  @Roles('ADMINISTRADOR')
  async updatePaymentMethod(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.update(id, dto);
  }

  /**
   * PATCH /api/admin/payments/methods/:id/toggle
   * Activar/Desactivar método de pago
   *
   * Body:
   * {
   *   "isActive": false
   * }
   */
  @Patch('methods/:id/toggle')
  @Roles('ADMINISTRADOR')
  async togglePaymentMethodActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.toggleActive(id, isActive);
  }

  /**
   * DELETE /api/admin/payments/methods/:id
   * Eliminar método de pago (soft delete)
   */
  @Delete('methods/:id')
  @Roles('ADMINISTRADOR')
  async deletePaymentMethod(@Param('id') id: string): Promise<void> {
    return this.paymentMethodsService.delete(id);
  }

  /**
   * ===================================
   * DENOMINACIONES DE EFECTIVO
   * ===================================
   */

  /**
   * GET /api/admin/payments/cash-denominations
   * Listar todas las denominaciones de efectivo
   */
  @Get('cash-denominations')
  @Roles('ADMINISTRADOR', 'GERENTE', 'CAJERO')
  async listCashDenominations(
    @Query('includeInactive') includeInactive?: boolean,
  ): Promise<CashDenominationResponseDto[]> {
    return this.cashDenominationsService.findAll(includeInactive);
  }

  /**
   * POST /api/admin/payments/cash-denominations
   * Crear una nueva denominación de efectivo
   *
   * Body:
   * {
   *   "value": 50,
   *   "type": "BILL"
   * }
   */
  @Post('cash-denominations')
  @Roles('ADMINISTRADOR')
  async createCashDenomination(
    @Body() dto: CreateCashDenominationDto,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.create(dto);
  }

  /**
   * GET /api/admin/payments/cash-denominations/:id
   * Obtener denominación por ID
   */
  @Get('cash-denominations/:id')
  @Roles('ADMINISTRADOR', 'GERENTE', 'CAJERO')
  async getCashDenomination(
    @Param('id') id: string,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.findById(id);
  }

  /**
   * PATCH /api/admin/payments/cash-denominations/:id
   * Actualizar cantidad de denominación
   *
   * Body:
   * {
   *   "quantity": 15  // Nueva cantidad
   * }
   */
  @Patch('cash-denominations/:id')
  @Roles('ADMINISTRADOR', 'GERENTE', 'CAJERO')
  async updateCashDenomination(
    @Param('id') id: string,
    @Body() dto: UpdateCashDenominationDto,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.updateQuantity(id, dto);
  }

  /**
   * PATCH /api/admin/payments/cash-denominations/:id/increment
   * Incrementar cantidad (agregar efectivo a caja)
   *
   * Body:
   * {
   *   "amount": 5  // Cantidad a agregar
   * }
   */
  @Patch('cash-denominations/:id/increment')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async incrementCashDenomination(
    @Param('id') id: string,
    @Body('amount') amount: number,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.incrementQuantity(id, amount);
  }

  /**
   * PATCH /api/admin/payments/cash-denominations/:id/decrement
   * Decrementar cantidad (sacar efectivo de caja)
   *
   * Body:
   * {
   *   "amount": 2  // Cantidad a restar
   * }
   */
  @Patch('cash-denominations/:id/decrement')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async decrementCashDenomination(
    @Param('id') id: string,
    @Body('amount') amount: number,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.decrementQuantity(id, amount);
  }

  /**
   * PATCH /api/admin/payments/cash-denominations/:id/toggle
   * Activar/Desactivar denominación
   */
  @Patch('cash-denominations/:id/toggle')
  @Roles('ADMINISTRADOR')
  async toggleCashDenominationActive(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.toggleActive(id, isActive);
  }

  /**
   * DELETE /api/admin/payments/cash-denominations/:id
   * Eliminar denominación de efectivo (solo si está vacía)
   */
  @Delete('cash-denominations/:id')
  @Roles('ADMINISTRADOR')
  async deleteCashDenomination(@Param('id') id: string): Promise<void> {
    return this.cashDenominationsService.delete(id);
  }

  /**
   * ===================================
   * REPORTES DE CAJA
   * ===================================
   */

  /**
   * GET /api/admin/payments/cash-summary
   * Obtener resumen total de efectivo en caja
   */
  @Get('cash-summary')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async getCashSummary(): Promise<any> {
    return this.cashDenominationsService.getCashSummary();
  }

  /**
   * GET /api/admin/payments/cash-total
   * Obtener total de efectivo en caja
   */
  @Get('cash-total')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async getCashTotal(): Promise<{ total: number }> {
    const total = await this.cashDenominationsService.getTotalCashAmount();
    return { total };
  }

  /**
   * PATCH /api/admin/payments/cash-reset
   * Resetear todas las denominaciones a 0 (cierre de caja)
   * Solo ADMINISTRADOR
   */
  @Patch('cash-reset')
  @Roles('ADMINISTRADOR')
  async resetCashDenominations(): Promise<{ message: string }> {
    await this.cashDenominationsService.resetAllQuantities();
    return { message: 'Todas las denominaciones han sido reseteadas a 0' };
  }
}
