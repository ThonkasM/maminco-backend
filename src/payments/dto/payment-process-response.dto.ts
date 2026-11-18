export class PaymentProcessResponseDto {
  status: 'PENDING_CONFIRMATION' | 'COMPLETED' | 'ERROR' | 'PARTIAL_PAYMENT';
  message: string;

  orderId?: string;
  orderNumber?: string;
  paymentId?: string;
  amountReceived?: number;
  amountApplied?: number;
  changeAmount?: number | null;
  tipAmount?: number;
  totalDue?: number;
  paymentMethod?: string;

  orderStatus?: 'CLOSED' | 'DRAFT' | 'CANCELLED';

  totalPaidSoFar?: number; // Total pagado hasta ahora (incluyendo este pago)
  pendingBalance?: number; // Saldo pendiente después de este pago
  isPaid?: boolean; // true si la orden está completamente pagada

  difference?: number;

  error?: string;
}
