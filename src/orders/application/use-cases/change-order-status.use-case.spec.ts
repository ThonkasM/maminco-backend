import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import {
  D,
  FakeOrderEvents,
  FakeOrderRepository,
  makeOrder,
} from '../testing/fakes';
import { ChangeOrderStatusUseCase } from './change-order-status.use-case';

function setup() {
  const repo = new FakeOrderRepository();
  const events = new FakeOrderEvents();
  const printer = { print: jest.fn().mockResolvedValue({ success: true }) };
  return {
    repo,
    events,
    printer,
    useCase: new ChangeOrderStatusUseCase(repo, events, printer),
  };
}

const ALL: OrderStatus[] = ['DRAFT', 'CLOSED', 'CANCELLED'];
const ALLOWED = new Set([
  'DRAFT>CLOSED',
  'DRAFT>CANCELLED',
  'CLOSED>CANCELLED',
]);

describe('ChangeOrderStatusUseCase', () => {
  const combos = ALL.flatMap((from) =>
    ALL.map((to) => [from, to, ALLOWED.has(`${from}>${to}`)] as const),
  );

  it.each(combos)('%s -> %s (allowed=%s)', async (from, to, allowed) => {
    const { repo, events, useCase } = setup();
    repo.seed(makeOrder({ status: from, paidTotal: D(100), paymentCount: 1 }));

    const result = useCase.execute('order-1', { status: to }, 'cashier-1');

    if (allowed) {
      await expect(result).resolves.toMatchObject({ status: to });
      expect(events.events[0]).toMatchObject({
        type: 'order.status.changed',
        status: to,
      });
    } else {
      await expect(result).rejects.toThrow(BadRequestException);
      expect(events.events).toHaveLength(0);
    }
  });

  it('returns 404 for unknown orders', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute('missing', { status: 'CLOSED' }, 'u'),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to close an order with an outstanding balance', async () => {
    const { repo, useCase } = setup();
    repo.seed(makeOrder({ paidTotal: D(40), paymentCount: 1 }));
    await expect(
      useCase.execute('order-1', { status: 'CLOSED' }, 'u'),
    ).rejects.toThrow(ConflictException);
    expect(repo.orders.get('order-1')!.status).toBe('DRAFT');
  });

  it('refuses to close an order without items', async () => {
    const { repo, useCase } = setup();
    repo.seed(makeOrder({ items: [], total: D(0), subtotal: D(0) }));
    await expect(
      useCase.execute('order-1', { status: 'CLOSED' }, 'u'),
    ).rejects.toThrow('sin items');
  });

  it('closes a fully paid order, records the closer and releases the table', async () => {
    const { repo, events, useCase } = setup();
    repo.seed(makeOrder({ paidTotal: D(100), paymentCount: 1 }));
    repo.tableStatus.set('table-1', 'OCCUPIED');

    await useCase.execute('order-1', { status: 'CLOSED' }, 'cashier-1');

    expect(repo.closedBy.get('order-1')).toBe('cashier-1');
    expect(repo.tableStatus.get('table-1')).toBe('AVAILABLE');
    expect(events.events[0]).toMatchObject({ tableReleased: true });
    expect(repo.histories[0].action).toBe('STATUS_CHANGED');
  });

  it('does not release the table when another DRAFT order is open', async () => {
    const { repo, events, useCase } = setup();
    repo.seed(makeOrder({ status: 'CLOSED', paidTotal: D(100) }));
    repo.seed(makeOrder({ id: 'order-2', status: 'DRAFT' }));
    repo.tableStatus.set('table-1', 'OCCUPIED');

    await useCase.execute('order-1', { status: 'CANCELLED' }, 'm');

    expect(repo.tableStatus.get('table-1')).toBe('OCCUPIED');
    expect(events.events[0]).toMatchObject({ tableReleased: false });
  });

  it('fails with a conflict when the conditional update loses the race', async () => {
    const { repo, events, useCase } = setup();
    repo.seed(makeOrder({ paidTotal: D(100) }));
    repo.rejectTransition = true;
    await expect(
      useCase.execute('order-1', { status: 'CLOSED' }, 'u'),
    ).rejects.toThrow(ConflictException);
    expect(events.events).toHaveLength(0);
  });

  it('prints only when closing with autoPrint', async () => {
    const { repo, printer, useCase } = setup();
    repo.seed(makeOrder({ paidTotal: D(100) }));
    await useCase.execute(
      'order-1',
      { status: 'CLOSED', autoPrint: true, printerName: 'p1' },
      'u',
    );
    expect(printer.print).toHaveBeenCalledWith('order-1', 'p1');
  });

  it('does not fail the request when printing throws', async () => {
    const { repo, printer, useCase } = setup();
    repo.seed(makeOrder({ paidTotal: D(100) }));
    printer.print.mockRejectedValue(new Error('cups down'));
    await expect(
      useCase.execute('order-1', { status: 'CLOSED', autoPrint: true }, 'u'),
    ).resolves.toMatchObject({ status: 'CLOSED' });
  });
});
