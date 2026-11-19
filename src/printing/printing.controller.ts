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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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

  @Get('test/escpos')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  testEscpos() {
    return this.printingService.renderTest();
  }

  @Get('orders/:orderId/escpos')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  async orderEscpos(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.printingService.renderOrderFromDatabase(orderId);
  }

  @Get('orders/:orderId/payment-receipt/escpos')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async paymentReceiptEscpos(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.printingService.renderPaymentReceiptFromDatabase(orderId);
  }

  @Post('test')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  async testPrint(@Body('printerName') printerName?: string) {
    return this.printingService.printTest(printerName);
  }

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

  @Post('orders/:orderId')
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  async printOrderFromDatabase(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('printer') printerName?: string,
  ) {
    return this.printingService.printOrderFromDatabase(orderId, printerName);
  }

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
      // Accept both the legacy and the current payload format
      paymentMethod?: string;
      amountReceived?: number;
      amountApplied?: number;
      changeAmount?: number;
      tipAmount?: number;
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
