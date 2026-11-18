export const PAYMENT_EVENTS_PUBLISHER = Symbol('PAYMENT_EVENTS_PUBLISHER');

export interface PaymentProcessedEvent {
  orderId: string;
  tableId: string;
  paymentId: string;
  amount: number;
  method: string;
  changeAmount: number;
  tipAmount: number;
  isPaid: boolean;
  paidBy: string;
}

export interface PaymentEventsPublisher {
  paymentProcessed(event: PaymentProcessedEvent): void;
}
