import { paymentMethodLabel } from '../payments/domain/payment-method-label';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PRINTER_PORT } from './domain/printer.port';
import type { PrinterPort } from './domain/printer.port';
import {
  OrderTicketData,
  PaymentReceiptData,
  PrintResult,
  ReceiptPayment,
  RenderedTicket,
  TicketItem,
} from './domain/ticket.types';
import {
  formatOrderTicket,
  formatPaymentReceipt,
  formatTestTicket,
} from './application/ticket-formatters';

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRINTER_PORT) private readonly printerPort: PrinterPort,
  ) {}

  listPrinters(): Promise<string[]> {
    return this.printerPort.listPrinters();
  }

  getDefaultPrinter(): Promise<string | null> {
    return this.printerPort.getDefaultPrinter();
  }

  private async resolvePrinter(printerName?: string): Promise<string> {
    const available = await this.printerPort.listPrinters();

    if (printerName) {
      if (!available.includes(printerName)) {
        throw new BadRequestException(`Impresora no válida: ${printerName}`);
      }
      return printerName;
    }

    const defaultPrinter = await this.printerPort.getDefaultPrinter();
    if (!defaultPrinter || !available.includes(defaultPrinter)) {
      throw new NotFoundException('No se encontró impresora disponible');
    }
    return defaultPrinter;
  }

  private failure(
    context: string,
    error: unknown,
  ): PrintResult & { data?: never } {
    this.logger.error(context, error);
    return {
      success: false,
      message: `Error al imprimir: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  async printTest(printerName?: string): Promise<PrintResult> {
    try {
      const printer = await this.resolvePrinter(printerName);
      await this.printerPort.send(
        printer,
        formatTestTicket(new Date()),
        'ticket-test',
      );
      return {
        success: true,
        message: `Ticket de prueba enviado a impresora: ${printer}`,
      };
    } catch (error) {
      return this.failure('Error imprimiendo prueba:', error);
    }
  }

  async printOrder(
    orderData: OrderTicketData,
    printerName?: string,
  ): Promise<PrintResult> {
    try {
      const printer = await this.resolvePrinter(printerName);
      await this.printerPort.send(
        printer,
        formatOrderTicket(orderData, new Date()),
        `ticket-order-${orderData.orderNumber}`,
      );
      return {
        success: true,
        message: `Orden #${orderData.orderNumber} impresa en: ${printer}`,
      };
    } catch (error) {
      return this.failure('Error imprimiendo orden:', error);
    }
  }

  private async loadOrderTicket(
    orderId: string,
  ): Promise<{ data: OrderTicketData } | { error: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        table: { include: { area: true } },
      },
    });

    if (!order) {
      return { error: `Orden con ID ${orderId} no encontrada` };
    }

    if (order.items.length === 0) {
      return {
        error: `La orden #${order.orderNumber} no tiene items para imprimir`,
      };
    }

    return {
      data: {
        orderNumber: order.orderNumber,
        items: this.toTicketItems(order.items),
        subtotal: Number(order.subtotal),
        discount: Number(order.discountAmount),
        total: Number(order.total),
        table: order.table?.number?.toString() || 'Sin mesa',
      },
    };
  }

  async printOrderFromDatabase(
    orderId: string,
    printerName?: string,
  ): Promise<PrintResult> {
    try {
      const loaded = await this.loadOrderTicket(orderId);
      if ('error' in loaded) {
        return { success: false, message: loaded.error };
      }
      return this.printOrder(loaded.data, printerName);
    } catch (error) {
      return this.failure('Error imprimiendo orden desde BD:', error);
    }
  }

  async renderOrderFromDatabase(orderId: string): Promise<RenderedTicket> {
    try {
      const loaded = await this.loadOrderTicket(orderId);
      if ('error' in loaded) {
        return { success: false, message: loaded.error };
      }
      return this.rendered(
        formatOrderTicket(loaded.data, new Date()),
        `Orden #${loaded.data.orderNumber} lista para imprimir`,
      );
    } catch (error) {
      return this.failure('Error generando ticket de orden:', error);
    }
  }

  renderTest(): RenderedTicket {
    return this.rendered(
      formatTestTicket(new Date()),
      'Ticket de prueba generado',
    );
  }

  private rendered(data: Buffer, message: string): RenderedTicket {
    return { success: true, message, data: data.toString('base64') };
  }

  async printPaymentReceipt(
    receiptData: PaymentReceiptData,
    printerName?: string,
  ): Promise<PrintResult> {
    try {
      const printer = await this.resolvePrinter(printerName);
      await this.printerPort.send(
        printer,
        formatPaymentReceipt(receiptData, new Date()),
        `receipt-payment-${receiptData.orderNumber}`,
      );
      return {
        success: true,
        message: `Recibo de pago impreso exitosamente en: ${printer}`,
      };
    } catch (error) {
      return this.failure('Error imprimiendo recibo de pago:', error);
    }
  }

  private async loadReceipt(
    orderId: string,
  ): Promise<{ data: PaymentReceiptData } | { error: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true } },
        table: { include: { area: true } },
        payments: {
          include: { paymentMethod: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      return { error: `Orden con ID ${orderId} no encontrada` };
    }

    if (order.items.length === 0) {
      return { error: `La orden #${order.orderNumber} no tiene items` };
    }

    if (order.payments.length === 0) {
      return {
        error: `La orden #${order.orderNumber} no tiene pagos registrados. Debes registrar los pagos ANTES de cerrar la orden. Flujo correcto: 1) Registrar pago(s) con POST /api/payments/orders/{orderId}, 2) Cerrar orden, 3) Imprimir recibo.`,
      };
    }

    const payments: ReceiptPayment[] = order.payments.map((payment) => ({
      method: paymentMethodLabel(
        payment.paymentMethod.code,
        payment.paymentMethod.name,
      ),
      received: Number(payment.amountReceived),
      applied: Number(payment.amountApplied),
      change: payment.changeAmount ? Number(payment.changeAmount) : undefined,
      tip: payment.tipAmount ? Number(payment.tipAmount) : undefined,
    }));

    this.logger.log(
      `Preparando recibo con ${payments.length} pago(s): ${payments.map((p) => p.method).join(', ')}`,
    );

    return {
      data: {
        orderNumber: order.orderNumber,
        items: this.toTicketItems(order.items),
        orderSubtotal: Number(order.subtotal),
        orderDiscount: Number(order.discountAmount),
        orderTotal: Number(order.total),
        table: order.table?.number?.toString() || 'Sin mesa',
        payments,
        totalReceived: sum(payments.map((p) => p.received)),
        totalApplied: sum(payments.map((p) => p.applied)),
        totalChange: sum(payments.map((p) => p.change ?? 0)),
        totalTip: sum(payments.map((p) => p.tip ?? 0)),
      },
    };
  }

  async printPaymentReceiptFromDatabase(
    orderId: string,
    printerName?: string,
  ): Promise<PrintResult> {
    try {
      const loaded = await this.loadReceipt(orderId);
      if ('error' in loaded) {
        return { success: false, message: loaded.error };
      }
      return this.printPaymentReceipt(loaded.data, printerName);
    } catch (error) {
      return this.failure('Error imprimiendo recibo de pago desde BD:', error);
    }
  }

  async renderPaymentReceiptFromDatabase(
    orderId: string,
  ): Promise<RenderedTicket> {
    try {
      const loaded = await this.loadReceipt(orderId);
      if ('error' in loaded) {
        return { success: false, message: loaded.error };
      }
      return this.rendered(
        formatPaymentReceipt(loaded.data, new Date()),
        `Recibo de la orden #${loaded.data.orderNumber} listo para imprimir`,
      );
    } catch (error) {
      return this.failure('Error generando recibo de pago:', error);
    }
  }

  private toTicketItems(
    items: Array<{
      quantity: number;
      unitPrice: unknown;
      subtotal: unknown;
      product: { name: string };
    }>,
  ): TicketItem[] {
    return items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    }));
  }
}
