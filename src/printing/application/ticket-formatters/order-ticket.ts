import { EscPosBuilder } from '../../domain/escpos-builder';
import { OrderTicketData } from '../../domain/ticket.types';
import {
  DocumentHeader,
  DocumentSummary,
  OrderDocumentTemplate,
} from './order-document.template';

class OrderTicketTemplate extends OrderDocumentTemplate<OrderTicketData> {
  protected readonly columnHeader =
    'Descripción         Cant  PUnit   Subtotal';

  protected header(data: OrderTicketData): DocumentHeader {
    return {
      orderNumber: data.orderNumber,
      table: data.table,
      customerName: data.customerName,
    };
  }

  protected items(data: OrderTicketData) {
    return data.items;
  }

  protected summary(data: OrderTicketData): DocumentSummary {
    return {
      subtotal: data.subtotal,
      discount: data.discount,
      total: data.total,
      totalLabel: 'Total',
    };
  }

  protected writeBody(encoder: EscPosBuilder, data: OrderTicketData): void {
    if (!data.notes) return;
    encoder
      .align('center')
      .text('Notas:')
      .align('left')
      .text(data.notes)
      .newline();
  }
}

const template = new OrderTicketTemplate();

export function formatOrderTicket(data: OrderTicketData, now: Date): Buffer {
  return template.render(data, now);
}
