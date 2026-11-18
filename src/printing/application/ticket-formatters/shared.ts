import { EscPosBuilder } from '../../domain/escpos-builder';
import { TicketItem } from '../../domain/ticket.types';

export const SEPARATOR = '------------------------';

export function money(value: number): string {
  return value.toFixed(2);
}

export function writeItemRows(
  encoder: EscPosBuilder,
  items: TicketItem[],
): void {
  for (const item of items) {
    const name = item.name.substring(0, 18).padEnd(18);
    const qty = String(item.quantity).padStart(4);
    const unitPrice = money(item.unitPrice).padStart(7);
    const subtotal = `Bs ${money(item.subtotal)}`.padStart(9);
    encoder.text(`${name}${qty}  ${unitPrice}  ${subtotal}`).newline();
  }
}
