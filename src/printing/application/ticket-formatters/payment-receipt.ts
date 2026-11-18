import { EscPosBuilder } from '../../domain/escpos-builder';
import { PaymentReceiptData } from '../../domain/ticket.types';
import {
  DocumentHeader,
  DocumentSummary,
  OrderDocumentTemplate,
} from './order-document.template';
import { money } from './shared';

class PaymentReceiptTemplate extends OrderDocumentTemplate<PaymentReceiptData> {
  protected readonly columnHeader =
    'Descripcion         Cant  PUnit   Subtotal';

  protected title(): string {
    return 'RECIBO DE PAGO';
  }

  protected header(data: PaymentReceiptData): DocumentHeader {
    return { orderNumber: data.orderNumber, table: data.table };
  }

  protected items(data: PaymentReceiptData) {
    return data.items;
  }

  protected summary(data: PaymentReceiptData): DocumentSummary {
    return {
      subtotal: data.orderSubtotal,
      discount: data.orderDiscount,
      total: data.orderTotal,
      totalLabel: 'Total Orden',
    };
  }

  protected footerLines(): string[] {
    return ['Gracias por su compra', 'Visitenos pronto'];
  }

  protected writeBody(encoder: EscPosBuilder, data: PaymentReceiptData): void {
    encoder
      .align('center')
      .text('========================')
      .text('DETALLE DE PAGO')
      .text('========================')
      .newline()
      .align('right');

    data.payments.forEach((payment, index) => {
      encoder.text(`Pago ${index + 1}: ${payment.method}`).newline();
      encoder.text(`  Recibido: Bs ${money(payment.received)}`).newline();
      encoder.text(`  Aplicado: Bs ${money(payment.applied)}`).newline();
      if (payment.change && payment.change > 0) {
        encoder.text(`  Cambio: Bs ${money(payment.change)}`).newline();
      }
      if (payment.tip && payment.tip > 0) {
        encoder.text(`  Propina: Bs ${money(payment.tip)}`).newline();
      }
      if (index < data.payments.length - 1) encoder.newline();
    });

    encoder
      .newline()
      .text('-----------------------')
      .bold(true)
      .text(`Total Recibido: Bs ${money(data.totalReceived)}`)
      .newline()
      .text(`Total Aplicado: Bs ${money(data.totalApplied)}`)
      .bold(false)
      .newline();

    if (data.totalChange > 0) {
      encoder
        .bold(true)
        .text(`Cambio Total: Bs ${money(data.totalChange)}`)
        .bold(false)
        .newline();
    }

    if (data.totalTip > 0) {
      encoder.text(`Propina Total: Bs ${money(data.totalTip)}`).newline();
    }
  }
}

const template = new PaymentReceiptTemplate();

export function formatPaymentReceipt(
  data: PaymentReceiptData,
  now: Date,
): Buffer {
  return template.render(data, now);
}
