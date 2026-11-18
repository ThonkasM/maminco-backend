import { Prisma } from '@prisma/client';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface PayableOrder {
  id: string;
  orderNumber: string;
  status: 'DRAFT' | 'CLOSED' | 'CANCELLED';
  tableId: string;
  total: Prisma.Decimal;
  paidTotal: Prisma.Decimal;
  createdByName: string;
}

export interface PaymentMethodSnapshot {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface NewPayment {
  orderId: string;
  paymentMethodId: string;
  createdById: string;
  amountReceived: Prisma.Decimal;
  amountApplied: Prisma.Decimal;
  changeAmount: Prisma.Decimal | null;
  tipAmount: Prisma.Decimal;
  auditDescription: string;
  auditValues: Prisma.InputJsonObject;
}

export interface PaymentTransaction {
  lockOrder(orderId: string): Promise<PayableOrder | null>;
  recordPayment(payment: NewPayment): Promise<string>;
  closeOrder(
    orderId: string,
    closedById: string,
    tipAmount: Prisma.Decimal,
  ): Promise<boolean>;
  releaseTableIfIdle(tableId: string): Promise<boolean>;
}

export interface PaymentRepository {
  findMethod(methodId: string): Promise<PaymentMethodSnapshot | null>;
  transaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T>;
}
