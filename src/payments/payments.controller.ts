import type { AuthUser } from '../auth/auth-user';
import { ParseUUIDPipe } from '@nestjs/common';
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ProcessPaymentUseCase } from './application/use-cases/process-payment.use-case';
import {
  ProcessPaymentDto,
  ListPaymentsQueryDto,
  PaymentResponseDto,
  PaginatedPaymentResponseDto,
  PaymentMethodResponseDto,
  PaymentProcessResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
  ) {}

  @Get('methods')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR', 'WAITER')
  async getPaymentMethods(): Promise<PaymentMethodResponseDto[]> {
    return this.paymentsService.getPaymentMethods();
  }

  @Post('orders/:orderId')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async processPayment(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ProcessPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PaymentProcessResponseDto> {
    return this.processPaymentUseCase.execute(orderId, dto, user.sub);
  }

  @Get('orders/:orderId')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR', 'WAITER')
  async getPaymentsByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPaymentsByOrder(orderId);
  }

  @Get()
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async findAll(
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaginatedPaymentResponseDto> {
    return this.paymentsService.findAll(query);
  }

  @Get(':paymentId')
  @Roles('CASHIER', 'MANAGER', 'ADMINISTRATOR')
  async findById(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.findById(paymentId);
  }

  @Get('stats/by-method')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getPaymentSummaryByMethod(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.paymentsService.getPaymentSummaryByMethod(start, end);
  }

  @Get('stats/total-revenue')
  @Roles('MANAGER', 'ADMINISTRATOR')
  async getTotalRevenue(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const totalRevenue = await this.paymentsService.getTotalRevenue(start, end);

    return {
      totalRevenue,
      startDate,
      endDate,
    };
  }
}
