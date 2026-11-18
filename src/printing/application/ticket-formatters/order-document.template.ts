import { EscPosBuilder } from '../../domain/escpos-builder';
import { TicketItem } from '../../domain/ticket.types';
import { formatDateForPrinter } from '../../domain/text-sanitizer';
import { money, SEPARATOR, writeItemRows } from './shared';

export interface DocumentHeader {
  orderNumber: string;
  table?: string;
  customerName?: string;
}

export interface DocumentSummary {
  subtotal: number;
  discount?: number;
  total: number;
  totalLabel: string;
}

export abstract class OrderDocumentTemplate<T> {
  protected abstract readonly columnHeader: string;

  protected abstract header(data: T): DocumentHeader;
  protected abstract items(data: T): TicketItem[];
  protected abstract summary(data: T): DocumentSummary;

  protected title(): string | null {
    return null;
  }

  protected writeBody(_encoder: EscPosBuilder, _data: T): void {}

  protected footerLines(): string[] {
    return ['Gracias por su compra'];
  }

  render(data: T, now: Date): Buffer {
    const encoder = new EscPosBuilder();
    this.writeHeader(encoder, data, now);
    writeItemRows(encoder, this.items(data));
    this.writeSummary(encoder, data);
    this.writeBody(encoder, data);
    this.writeFooter(encoder);
    return encoder.encode();
  }

  private writeHeader(encoder: EscPosBuilder, data: T, now: Date): void {
    const header = this.header(data);
    const title = this.title();

    encoder
      .initialize()
      .newline()
      .align('center')
      .bold(true)
      .text('MAMINCO')
      .bold(false)
      .newline()
      .text('Restaurante Boliviano')
      .newline();

    if (title) encoder.text(title).newline();

    encoder
      .text(SEPARATOR)
      .newline()
      .text(`Orden #${header.orderNumber}`)
      .newline();

    if (header.table) encoder.text(`Mesa: ${header.table}`).newline();
    if (header.customerName) {
      encoder.text(`Cliente: ${header.customerName}`).newline();
    }

    encoder
      .text(`Fecha: ${formatDateForPrinter(now)}`)
      .newline()
      .text(SEPARATOR)
      .newline()
      .newline()
      .align('left')
      .text(this.columnHeader)
      .text(SEPARATOR)
      .newline();
  }

  private writeSummary(encoder: EscPosBuilder, data: T): void {
    const summary = this.summary(data);

    encoder.newline().text('-----------------------').align('right');
    encoder.text(`Subtotal: Bs ${money(summary.subtotal)}`).newline();

    if (summary.discount && summary.discount > 0) {
      encoder.text(`Descuento: -Bs ${money(summary.discount)}`).newline();
    }

    encoder
      .bold(true)
      .text(`${summary.totalLabel}: Bs ${money(summary.total)}`)
      .bold(false)
      .newline()
      .newline();
  }

  private writeFooter(encoder: EscPosBuilder): void {
    encoder.newline().newline().align('center');
    for (const line of this.footerLines()) {
      encoder.text(line).newline();
    }
    encoder.newline().cut();
  }
}
