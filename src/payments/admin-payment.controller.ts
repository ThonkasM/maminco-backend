import { ParseUUIDPipe } from '@nestjs/common';
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
 * Solo accesible para ADMINISTRATOR y MANAGER
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
  @Roles('ADMINISTRATOR', 'MANAGER')
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
  @Roles('ADMINISTRATOR')
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
  @Roles('ADMINISTRATOR', 'MANAGER')
  async getPaymentMethod(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.findById(id);
  }

  /**
   * PATCH /api/admin/payments/methods/:id
   * Actualizar método de pago
   */
  @Patch('methods/:id')
  @Roles('ADMINISTRATOR')
  async updatePaymentMethod(
    @Param('id', ParseUUIDPipe) id: string,
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
  @Roles('ADMINISTRATOR')
  async togglePaymentMethodActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.toggleActive(id, isActive);
  }

  /**
   * DELETE /api/admin/payments/methods/:id
   * Eliminar método de pago (soft delete)
   */
  @Delete('methods/:id')
  @Roles('ADMINISTRATOR')
  async deletePaymentMethod(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
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
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
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
  @Roles('ADMINISTRATOR')
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
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async getCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
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
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async updateCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
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
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async incrementCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
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
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async decrementCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('amount') amount: number,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.decrementQuantity(id, amount);
  }

  /**
   * PATCH /api/admin/payments/cash-denominations/:id/toggle
   * Activar/Desactivar denominación
   */
  @Patch('cash-denominations/:id/toggle')
  @Roles('ADMINISTRATOR')
  async toggleCashDenominationActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.toggleActive(id, isActive);
  }

  /**
   * DELETE /api/admin/payments/cash-denominations/:id
   * Eliminar denominación de efectivo (solo si está vacía)
   */
  @Delete('cash-denominations/:id')
  @Roles('ADMINISTRATOR')
  async deleteCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
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
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async getCashSummary(): Promise<any> {
    return this.cashDenominationsService.getCashSummary();
  }

  /**
   * GET /api/admin/payments/cash-total
   * Obtener total de efectivo en caja
   */
  @Get('cash-total')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async getCashTotal(): Promise<{ total: number }> {
    const total = await this.cashDenominationsService.getTotalCashAmount();
    return { total };
  }

  /**
   * PATCH /api/admin/payments/cash-reset
   * Resetear todas las denominaciones a 0 (cierre de caja)
   * Solo ADMINISTRATOR
   */
  @Patch('cash-reset')
  @Roles('ADMINISTRATOR')
  async resetCashDenominations(): Promise<{ message: string }> {
    await this.cashDenominationsService.resetAllQuantities();
    return { message: 'Todas las denominaciones han sido reseteadas a 0' };
  }
}
