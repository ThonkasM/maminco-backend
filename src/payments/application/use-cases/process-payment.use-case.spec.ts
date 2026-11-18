/* eslint-disable @typescript-eslint/require-await */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  D,
  FakeOrderEvents,
  FakeOrderRepository,
  makeOrder,
} from '../../../orders/application/testing/fakes';
import {
  NewPayment,
  PayableOrder,
  PaymentMethodSnapshot,
  PaymentRepository,
  PaymentTransaction,
} from '../ports/payment.repository';
import { ProcessPaymentUseCase } from './process-payment.use-case';

class FakePaymentRepository implements PaymentRepository {
  orders = new Map<string, PayableOrder>();
  methods = new Map<string, PaymentMethodSnapshot>([
    ['cash', { id: 'cash', name: 'Efectivo', code: 'CASH', isActive: true }],
    ['card', { id: 'card', name: 'Tarjeta', code: 'CARD', isActive: true }],
    ['off', { id: 'off', name: 'Viejo', code: 'CASH', isActive: false }],
  ]);
  payments: NewPayment[] = [];
  closeResult = true;
  tableReleased = true;
  closedTips: Prisma.Decimal[] = [];

  async findMethod(id: string) {
    return this.methods.get(id) ?? null;
  }

  async transaction<T>(work: (tx: PaymentTransaction) => Promise<T>) {
    return work({
      lockOrder: async (id) => this.orders.get(id) ?? null,
      recordPayment: async (p) => {
        this.payments.push(p);
        return `pay-${this.payments.length}`;
      },
      closeOrder: async (_id, _by, tip) => {
        this.closedTips.push(tip);
        return this.closeResult;
      },
      releaseTableIfIdle: async () => this.tableReleased,
    });
  }
}

function payable(overrides: Partial<PayableOrder> = {}): PayableOrder {
  return {
    id: 'order-1',
    orderNumber: '000001',
    status: 'DRAFT',
    tableId: 'table-1',
    total: D(100),
    paidTotal: D(0),
    createdByName: 'Mesero',
    ...overrides,
  };
}

function setup(order: PayableOrder | null = payable()) {
  const payments = new FakePaymentRepository();
  if (order) payments.orders.set(order.id, order);
  const orders = new FakeOrderRepository();
  orders.seed(makeOrder({ status: 'CLOSED' }));
  const orderEvents = new FakeOrderEvents();
  const paymentEvents = { paymentProcessed: jest.fn() };
  const useCase = new ProcessPaymentUseCase(
    payments,
    paymentEvents,
    orders,
    orderEvents,
  );
  return { payments, orderEvents, paymentEvents, useCase };
}

describe('ProcessPaymentUseCase', () => {
  it('404s on unknown orders', async () => {
    const { useCase } = setup(null);
    await expect(
      useCase.execute(
        'order-1',
        { paymentMethodId: 'cash', amountReceived: 10 },
        'u',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns an ERROR body for CLOSED orders without writing', async () => {
    const { useCase, payments } = setup(payable({ status: 'CLOSED' }));
    const result = await useCase.execute(
      'order-1',
      { paymentMethodId: 'cash', amountReceived: 10 },
      'u',
    );
    expect(result).toMatchObject({
      status: 'ERROR',
      error: 'ORDER_ALREADY_CLOSED',
    });
    expect(payments.payments).toHaveLength(0);
  });

  it('rejects CANCELLED orders', async () => {
    const { useCase } = setup(payable({ status: 'CANCELLED' }));
    await expect(
      useCase.execute(
        'order-1',
        { paymentMethodId: 'cash', amountReceived: 10 },
        'u',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['off', 'missing'])(
    'rejects inactive or unknown method %s',
    async (id) => {
      const { useCase } = setup();
      await expect(
        useCase.execute(
          'order-1',
          { paymentMethodId: id, amountReceived: 10 },
          'u',
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('returns INVALID_AMOUNT for non-positive amounts', async () => {
    const { useCase, payments } = setup();
    const result = await useCase.execute(
      'order-1',
      { paymentMethodId: 'cash', amountReceived: 0 },
      'u',
    );
    expect(result).toMatchObject({ status: 'ERROR', error: 'INVALID_AMOUNT' });
    expect(payments.payments).toHaveLength(0);
  });

  it('rejects payments when nothing is pending (409)', async () => {
    const { useCase, payments } = setup(payable({ paidTotal: D(100) }));
    await expect(
      useCase.execute(
        'order-1',
        { paymentMethodId: 'cash', amountReceived: 5 },
        'u',
      ),
    ).rejects.toThrow(ConflictException);
    expect(payments.payments).toHaveLength(0);
  });

  it('rejects payments when the total dropped below what was paid', async () => {
    const { useCase } = setup(payable({ total: D(80), paidTotal: D(100) }));
    await expect(
      useCase.execute(
        'order-1',
        { paymentMethodId: 'cash', amountReceived: 5 },
        'u',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('registers a partial payment without closing', async () => {
    const { useCase, payments, orderEvents, paymentEvents } = setup();
    const result = await useCase.execute(
      'order-1',
      { paymentMethodId: 'cash', amountReceived: 40 },
      'u',
    );
    expect(result).toMatchObject({
      status: 'PARTIAL_PAYMENT',
      amountApplied: 40,
      pendingBalance: 60,
      totalPaidSoFar: 40,
      orderStatus: 'DRAFT',
      isPaid: false,
    });
    expect(payments.closedTips).toHaveLength(0);
    expect(orderEvents.events).toHaveLength(0);
    expect(paymentEvents.paymentProcessed).toHaveBeenCalledWith(
      expect.objectContaining({ isPaid: false, amount: 40 }),
    );
  });

  it('closes on the final cash payment and returns change', async () => {
    const { useCase, payments, orderEvents } = setup(
      payable({ paidTotal: D(40) }),
    );
    const result = await useCase.execute(
      'order-1',
      { paymentMethodId: 'cash', amountReceived: 100 },
      'u',
    );
    expect(result).toMatchObject({
      status: 'COMPLETED',
      amountApplied: 60,
      changeAmount: 40,
      totalPaidSoFar: 100,
      orderStatus: 'CLOSED',
    });
    expect(payments.payments[0].auditDescription).toContain('PAGO FINAL');
    expect(orderEvents.events[0]).toMatchObject({
      type: 'order.status.changed',
      status: 'CLOSED',
      tableReleased: true,
    });
  });

  it('asks for tip confirmation on card overpayment and records the tip', async () => {
    const { useCase, payments } = setup();
    const ask = await useCase.execute(
      'order-1',
      { paymentMethodId: 'card', amountReceived: 110 },
      'u',
    );
    expect(ask).toMatchObject({
      status: 'PENDING_CONFIRMATION',
      difference: 10,
    });
    expect(payments.payments).toHaveLength(0);

    const done = await useCase.execute(
      'order-1',
      { paymentMethodId: 'card', amountReceived: 110, isExtraTip: true },
      'u',
    );
    expect(done).toMatchObject({ status: 'COMPLETED', tipAmount: 10 });
    expect(payments.closedTips[0].toString()).toBe('10');
  });

  it('raises a conflict when the order was closed concurrently', async () => {
    const { useCase, payments } = setup();
    payments.closeResult = false;
    await expect(
      useCase.execute(
        'order-1',
        { paymentMethodId: 'cash', amountReceived: 100 },
        'u',
      ),
    ).rejects.toThrow(ConflictException);
  });
});
