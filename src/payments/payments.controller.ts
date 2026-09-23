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
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Obtiene todos los métodos de pago disponibles
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR, MESERO
   *
   * GET /api/payments/methods
   *
   * Respuesta:
   * [
   *   {
   *     "id": "pm-001",
   *     "name": "EFECTIVO",
   *     "description": "Pago en efectivo",
   *     "isActive": true
   *   }
   * ]
   */
  @Get('methods')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR', 'MESERO')
  async getPaymentMethods(): Promise<PaymentMethodResponseDto[]> {
    return this.paymentsService.getPaymentMethods();
  }

  /**
   * Procesa un pago en una orden
   *
   * FLUJO POR MÉTODO DE PAGO:
   *
   * 1. EFECTIVO:
   *    POST /api/payments/orders/ord-123
   *    {
   *      "paymentMethodId": "efectivo",
   *      "amountReceived": 250.00
   *    }
   *    → Respuesta: Cambio a dar $5 (si cuenta es $245)
   *
   * 2. TRANSFERENCIA/TARJETA (Monto exacto):
   *    POST /api/payments/orders/ord-123
   *    {
   *      "paymentMethodId": "tarjeta",
   *      "amountReceived": 245.00
   *    }
   *    → Respuesta: Pago completado
   *
   * 3. TRANSFERENCIA/TARJETA (Con propina):
   *    Paso 1 - Enviar monto:
   *    POST /api/payments/orders/ord-123
   *    {
   *      "paymentMethodId": "tarjeta",
   *      "amountReceived": 255.00
   *    }
   *    → Respuesta: status=PENDING_CONFIRMATION, pregunta si es propina
   *
   *    Paso 2 - Confirmar propina:
   *    POST /api/payments/orders/ord-123
   *    {
   *      "paymentMethodId": "tarjeta",
   *      "amountReceived": 255.00,
   *      "isExtraTip": true
   *    }
   *    → Respuesta: Pago completado, propina de $10 registrada
   *
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR
   */
  @Post('orders/:orderId')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async processPayment(
    @Param('orderId') orderId: string,
    @Body() dto: ProcessPaymentDto,
    @CurrentUser() user: any,
  ): Promise<PaymentProcessResponseDto> {
    return this.paymentsService.processPayment(orderId, dto, user.sub);
  }

  /**
   * Obtiene todos los pagos de una orden específica
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR, MESERO
   *
   * GET /api/payments/orders/:orderId
   *
   * Respuesta:
   * [
   *   {
   *     "id": "pay-001",
   *     "orderId": "ord-123",
   *     "orderNumber": "000001",
   *     "amount": 250.50,
   *     "paymentMethod": { "id": "pm-001", "name": "EFECTIVO" },
   *     "createdBy": { "id": "user-1", "name": "Juan", "email": "juan@example.com" },
   *     "createdAt": "2025-11-07T14:30:00.000Z"
   *   }
   * ]
   */
  @Get('orders/:orderId')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR', 'MESERO')
  async getPaymentsByOrder(
    @Param('orderId') orderId: string,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.getPaymentsByOrder(orderId);
  }

  /**
   * Lista todos los pagos con filtros y paginación
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR
   *
   * GET /api/payments?page=1&limit=20&paymentMethodId=pm-001&startDate=2025-11-01
   *
   * Query Params:
   * - page: número de página (default: 1)
   * - limit: registros por página (default: 20, max: 100)
   * - orderId: filtrar por orden
   * - paymentMethodId: filtrar por método de pago
   * - createdById: filtrar por usuario que registró
   * - startDate: fecha inicio (ISO format)
   * - endDate: fecha fin (ISO format)
   *
   * Respuesta:
   * {
   *   "data": [...],
   *   "pagination": {
   *     "total": 150,
   *     "page": 1,
   *     "limit": 20,
   *     "pages": 8
   *   }
   * }
   */
  @Get()
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async findAll(
    @Query() query: ListPaymentsQueryDto,
  ): Promise<PaginatedPaymentResponseDto> {
    return this.paymentsService.findAll(query);
  }

  /**
   * Obtiene un pago por ID
   * Roles permitidos: CAJERO, GERENTE, ADMINISTRADOR
   *
   * GET /api/payments/:paymentId
   */
  @Get(':paymentId')
  @Roles('CAJERO', 'GERENTE', 'ADMINISTRADOR')
  async findById(
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.findById(paymentId);
  }

  /**
   * Obtiene resumen de pagos por método de pago
   * Útil para reportes
   * Roles permitidos: GERENTE, ADMINISTRADOR
   *
   * GET /api/payments/stats/by-method?startDate=2025-11-01&endDate=2025-11-07
   *
   * Respuesta:
   * [
   *   {
   *     "method": "EFECTIVO",
   *     "total": 5250.75,
   *     "count": 12,
   *     "average": 437.56
   *   },
   *   {
   *     "method": "TARJETA",
   *     "total": 3150.00,
   *     "count": 8,
   *     "average": 393.75
   *   }
   * ]
   */
  @Get('stats/by-method')
  @Roles('GERENTE', 'ADMINISTRADOR')
  async getPaymentSummaryByMethod(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.paymentsService.getPaymentSummaryByMethod(start, end);
  }

  /**
   * Obtiene ingresos totales en un rango de fechas
   * Roles permitidos: GERENTE, ADMINISTRADOR
   *
   * GET /api/payments/stats/total-revenue?startDate=2025-11-01&endDate=2025-11-07
   *
   * Respuesta:
   * {
   *   "totalRevenue": 8400.75,
   *   "startDate": "2025-11-01",
   *   "endDate": "2025-11-07"
   * }
   */
  @Get('stats/total-revenue')
  @Roles('GERENTE', 'ADMINISTRADOR')
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
