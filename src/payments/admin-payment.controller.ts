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

  @Get('methods')
  @Roles('ADMINISTRATOR', 'MANAGER')
  async listPaymentMethods(
    @Query('includeInactive') includeInactive?: boolean,
  ): Promise<PaymentMethodResponseDto[]> {
    return this.paymentMethodsService.findAll(includeInactive);
  }

  @Post('methods')
  @Roles('ADMINISTRATOR')
  async createPaymentMethod(
    @Body() dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.create(dto);
  }

  @Get('methods/:id')
  @Roles('ADMINISTRATOR', 'MANAGER')
  async getPaymentMethod(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.findById(id);
  }

  @Patch('methods/:id')
  @Roles('ADMINISTRATOR')
  async updatePaymentMethod(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.update(id, dto);
  }

  @Patch('methods/:id/toggle')
  @Roles('ADMINISTRATOR')
  async togglePaymentMethodActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodsService.toggleActive(id, isActive);
  }

  @Delete('methods/:id')
  @Roles('ADMINISTRATOR')
  async deletePaymentMethod(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.paymentMethodsService.delete(id);
  }

  @Get('cash-denominations')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async listCashDenominations(
    @Query('includeInactive') includeInactive?: boolean,
  ): Promise<CashDenominationResponseDto[]> {
    return this.cashDenominationsService.findAll(includeInactive);
  }

  @Post('cash-denominations')
  @Roles('ADMINISTRATOR')
  async createCashDenomination(
    @Body() dto: CreateCashDenominationDto,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.create(dto);
  }

  @Get('cash-denominations/:id')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async getCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.findById(id);
  }

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

  @Patch('cash-denominations/:id/decrement')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async decrementCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('amount') amount: number,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.decrementQuantity(id, amount);
  }

  @Patch('cash-denominations/:id/toggle')
  @Roles('ADMINISTRATOR')
  async toggleCashDenominationActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ): Promise<CashDenominationResponseDto> {
    return this.cashDenominationsService.toggleActive(id, isActive);
  }

  @Delete('cash-denominations/:id')
  @Roles('ADMINISTRATOR')
  async deleteCashDenomination(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.cashDenominationsService.delete(id);
  }

  @Get('cash-summary')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async getCashSummary(): Promise<any> {
    return this.cashDenominationsService.getCashSummary();
  }

  @Get('cash-total')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async getCashTotal(): Promise<{ total: number }> {
    const total = await this.cashDenominationsService.getTotalCashAmount();
    return { total };
  }

  @Patch('cash-reset')
  @Roles('ADMINISTRATOR')
  async resetCashDenominations(): Promise<{ message: string }> {
    await this.cashDenominationsService.resetAllQuantities();
    return { message: 'Todas las denominaciones han sido reseteadas a 0' };
  }
}
