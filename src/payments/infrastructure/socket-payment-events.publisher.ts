import { Injectable } from '@nestjs/common';
import { PaymentsGateway } from '../payments.gateway';
import {
  PaymentEventsPublisher,
  PaymentProcessedEvent,
} from '../application/ports/payment-events.publisher';

@Injectable()
export class SocketPaymentEventsPublisher implements PaymentEventsPublisher {
  constructor(private readonly gateway: PaymentsGateway) {}

  paymentProcessed({ orderId, tableId, ...data }: PaymentProcessedEvent): void {
    this.gateway.emitPaymentProcessed(orderId, tableId, data);
  }
}
