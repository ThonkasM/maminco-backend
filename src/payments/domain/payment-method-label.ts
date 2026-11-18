const LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
};

/** Spanish display label for a payment method; custom methods keep their own name. */
export function paymentMethodLabel(code: string, name: string): string {
  return LABELS[code] ?? name;
}
