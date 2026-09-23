import { ParseUUIDPipe } from '@nestjs/common';
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Param,
  Query,
} from '@nestjs/common';
import { PrintingService } from './printing.service';
import { PrintOrderDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Controlador para gestionar impresión de tickets
 */
@Controller('api/printing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PrintingController {
  constructor(private printingService: PrintingService) {}

  /**
   * GET /api/printing/printers
   * Listar impresoras disponibles
   */
  @Get('printers')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  async listPrinters() {
    const printers = await this.printingService.listPrinters();
    const defaultPrinter = await this.printingService.getDefaultPrinter();

    return {
      printers,
      defaultPrinter,
      count: printers.length,
    };
  }

  /**
   * POST /api/printing/test
   * Imprimir ticket de prueba
   *
   * Body (opcional):
   * {
   *   "printerName": "BixolonSRP350"
   * }
   */
  @Post('test')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async testPrint(@Body('printerName') printerName?: string) {
    return this.printingService.printTest(printerName);
  }

  /**
   * POST /api/printing/order
   * Imprimir orden
   *
   * Body:
   * {
   *   "orderNumber": "ORD-001",
   *   "items": [
   *     {
   *       "name": "Pato Criollo",
   *       "quantity": 2,
   *       "unitPrice": 45.50,
   *       "subtotal": 91.00
   *     }
   *   ],
   *   "subtotal": 100.00,
   *   "discount": 0,
   *   "total": 100.00,
   *   "table": "5",
   *   "customerName": "Juan",
   *   "notes": "Sin ajo"
   * }
   */
  @Post('order')
  @Roles('ADMINISTRATOR', 'MANAGER', 'WAITER')
  async printOrder(
    @Body()
    orderData: {
      orderNumber: string;
      items: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }>;
      subtotal: number;
      discount?: number;
      total: number;
      table?: string;
      customerName?: string;
      notes?: string;
    },
    @Query('printer') printerName?: string,
  ) {
    return this.printingService.printOrder(orderData, printerName);
  }

  /**
   * POST /api/printing/orders/:orderId
   * Imprimir una orden desde la base de datos
   * Busca la orden, sus items y productos, y los imprime automáticamente
   *
   * Query params:
   * - printer: nombre de la impresora (opcional, usa la por defecto si no se especifica)
   */
  @Post('orders/:orderId')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  async printOrderFromDatabase(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('printer') printerName?: string,
  ) {
    return this.printingService.printOrderFromDatabase(orderId, printerName);
  }

  /**
   * POST /api/printing/payment-receipt
   * Imprimir recibo de pago
   *
   * Body:
   * {
   *   "orderNumber": "000001",
   *   "items": [
   *     {
   *       "name": "Pato Criollo",
   *       "quantity": 2,
   *       "unitPrice": 45.50,
   *       "subtotal": 91.00
   *     }
   *   ],
   *   "orderSubtotal": 100.00,
   *   "orderDiscount": 0,
   *   "orderTotal": 100.00,
   *   "table": "5",
   *   "paymentMethod": "EFECTIVO",
   *   "amountReceived": 100.00,
   *   "amountApplied": 100.00,
   *   "changeAmount": 0,
   *   "tipAmount": 0
   * }
   */
  @Post('payment-receipt')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async printPaymentReceipt(
    @Body()
    receiptData: {
      orderNumber: string;
      items: Array<{
        name: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }>;
      orderSubtotal: number;
      orderDiscount?: number;
      orderTotal: number;
      table?: string;
      // Aceptar tanto formato antiguo como nuevo
      paymentMethod?: string;
      amountReceived?: number;
      amountApplied?: number;
      changeAmount?: number;
      tipAmount?: number;
      // O formato nuevo con múltiples pagos
      payments?: Array<{
        method: string;
        received: number;
        applied: number;
        change?: number;
        tip?: number;
      }>;
      totalReceived?: number;
      totalApplied?: number;
      totalChange?: number;
      totalTip?: number;
    },
    @Query('printer') printerName?: string,
  ) {
    // Si usa formato antiguo, convertir a nuevo formato
    if (receiptData.paymentMethod && !receiptData.payments) {
      receiptData.payments = [
        {
          method: receiptData.paymentMethod,
          received: receiptData.amountReceived || 0,
          applied: receiptData.amountApplied || 0,
          change: receiptData.changeAmount,
          tip: receiptData.tipAmount,
        },
      ];
      receiptData.totalReceived = receiptData.amountReceived || 0;
      receiptData.totalApplied = receiptData.amountApplied || 0;
      receiptData.totalChange = receiptData.changeAmount || 0;
      receiptData.totalTip = receiptData.tipAmount || 0;
    }

    return this.printingService.printPaymentReceipt(
      receiptData as {
        orderNumber: string;
        items: Array<{
          name: string;
          quantity: number;
          unitPrice: number;
          subtotal: number;
        }>;
        orderSubtotal: number;
        orderDiscount?: number;
        orderTotal: number;
        table?: string;
        payments: Array<{
          method: string;
          received: number;
          applied: number;
          change?: number;
          tip?: number;
        }>;
        totalReceived: number;
        totalApplied: number;
        totalChange: number;
        totalTip: number;
      },
      printerName,
    );
  }

  /**
   * POST /api/printing/orders/:orderId/payment-receipt
   * Imprimir recibo de pago desde la base de datos
   * Busca la orden, sus pagos y genera el recibo automáticamente
   *
   * Query params:
   * - printer: nombre de la impresora (opcional, usa la por defecto si no se especifica)
   */
  @Post('orders/:orderId/payment-receipt')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async printPaymentReceiptFromDatabase(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('printer') printerName?: string,
  ) {
    return this.printingService.printPaymentReceiptFromDatabase(
      orderId,
      printerName,
    );
  }
}
