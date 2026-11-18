import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  D,
  FakeOrderEvents,
  FakeOrderRepository,
  makeOrder,
} from '../testing/fakes';
import { AddOrderItemUseCase } from './add-order-item.use-case';
import { RemoveOrderItemUseCase } from './remove-order-item.use-case';
import { UpdateOrderItemUseCase } from './update-order-item.use-case';
import { ApplyDiscountUseCase } from './apply-discount.use-case';
import { AddTipUseCase } from './add-tip.use-case';

function setup(flags: Record<string, boolean> = {}) {
  const repo = new FakeOrderRepository();
  const events = new FakeOrderEvents();
  const featureFlags = { evaluate: jest.fn().mockResolvedValue(flags) };
  const remove = new RemoveOrderItemUseCase(
    repo,
    events,
    featureFlags as never,
  );
  return {
    repo,
    events,
    add: new AddOrderItemUseCase(repo, events),
    remove,
    update: new UpdateOrderItemUseCase(repo, events, remove),
    discount: new ApplyDiscountUseCase(repo, events),
    tip: new AddTipUseCase(repo, events),
  };
}

const waiter = { id: 'user-1', role: 'WAITER' };
const manager = { id: 'user-2', role: 'MANAGER' };

describe('item use cases', () => {
  it('adds an item, recomputes totals and resets a READY kitchen', async () => {
    const { repo, events, add } = setup();
    repo.seed(makeOrder({ kitchenStatus: 'READY' }));

    const order = await add.execute(
      'order-1',
      { productId: 'product-1', quantity: 1 },
      'user-1',
    );

    expect(order.subtotal).toBe(150);
    expect(order.total).toBe(150);
    expect(order.kitchenStatus).toBe('PENDING');
    expect(events.events[0]).toMatchObject({
      type: 'order.item.added',
      kitchenReset: true,
    });
  });

  it.each([
    ['CLOSED', ForbiddenException],
    ['CANCELLED', ForbiddenException],
  ] as const)('rejects adding to a %s order', async (status, error) => {
    const { repo, add } = setup();
    repo.seed(makeOrder({ status }));
    await expect(
      add.execute('order-1', { productId: 'product-1', quantity: 1 }, 'u'),
    ).rejects.toThrow(error);
  });

  it('rejects mutations once payments exist (409)', async () => {
    const { repo, add, remove, update, discount } = setup();
    repo.seed(makeOrder({ paidTotal: D(10), paymentCount: 1 }));

    await expect(
      add.execute('order-1', { productId: 'product-1', quantity: 1 }, 'u'),
    ).rejects.toThrow(ConflictException);
    await expect(remove.execute('order-1', 'item-1', manager)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      update.execute('order-1', 'item-1', { quantity: 5 }, manager),
    ).rejects.toThrow(ConflictException);
    await expect(
      discount.execute('order-1', { fixedDiscount: 5 }, 'u'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects unknown or unavailable products', async () => {
    const { repo, add } = setup();
    repo.seed(makeOrder());
    await expect(
      add.execute('order-1', { productId: 'x', quantity: 1 }, 'u'),
    ).rejects.toThrow(NotFoundException);
    repo.products.get('product-1')!.isAvailable = false;
    await expect(
      add.execute('order-1', { productId: 'product-1', quantity: 1 }, 'u'),
    ).rejects.toThrow(BadRequestException);
  });

  it('removes an item and keeps discount and tip in the total', async () => {
    const { repo, remove } = setup();
    repo.seed(
      makeOrder({
        discountAmount: D(10),
        tipAmount: D(5),
        items: [
          ...makeOrder().items,
          {
            id: 'item-2',
            productId: 'product-1',
            productName: 'Pato',
            quantity: 1,
            unitPrice: D(30),
            discountAmount: D(0),
          },
        ],
      }),
    );

    const order = await remove.execute('order-1', 'item-2', manager);

    expect(order.subtotal).toBe(100);
    expect(order.total).toBe(95);
    await expect(remove.execute('order-1', 'item-2', manager)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('forbids waiters from removing items when the flag is off', async () => {
    const { repo, remove, update } = setup({
      waiter_can_remove_products: false,
    });
    repo.seed(makeOrder());
    await expect(remove.execute('order-1', 'item-1', waiter)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      update.execute('order-1', 'item-1', { quantity: 0 }, waiter),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      remove.execute('order-1', 'item-1', manager),
    ).resolves.toBeDefined();
  });

  it('lets waiters remove items when the flag is on or unset', async () => {
    for (const flags of [
      { waiter_can_remove_products: true } as Record<string, boolean>,
      {} as Record<string, boolean>,
    ]) {
      const { repo, remove } = setup(flags);
      repo.seed(makeOrder());
      await expect(
        remove.execute('order-1', 'item-1', waiter),
      ).resolves.toBeDefined();
    }
  });

  it('updates the quantity and recomputes totals', async () => {
    const { repo, events, update } = setup();
    repo.seed(makeOrder());
    const order = await update.execute(
      'order-1',
      'item-1',
      { quantity: 3 },
      waiter,
    );
    expect(order.total).toBe(150);
    expect(events.events[0]).toMatchObject({
      type: 'order.item.updated',
      subtotal: 150,
    });
  });

  it('applies discounts and validates them', async () => {
    const { repo, discount } = setup();
    repo.seed(makeOrder());
    const order = await discount.execute(
      'order-1',
      { percentageDiscount: 10 },
      'u',
    );
    expect(order.discountAmount).toBe(10);
    expect(order.total).toBe(90);
    await expect(discount.execute('order-1', {}, 'u')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      discount.execute('order-1', { fixedDiscount: 500 }, 'u'),
    ).rejects.toThrow('mayor al subtotal');
  });

  it('adds a tip on DRAFT orders only', async () => {
    const { repo, events, tip } = setup();
    repo.seed(makeOrder());
    const order = await tip.execute('order-1', 12.5, 'u');
    expect(order.total).toBe(112.5);
    expect(events.events[0].type).toBe('order.totals.updated');

    repo.seed(makeOrder({ id: 'order-2', status: 'CLOSED' }));
    await expect(tip.execute('order-2', 5, 'u')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(tip.execute('order-1', -1, 'u')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a tip that would drop the total below what was paid', async () => {
    const { repo, tip } = setup();
    repo.seed(
      makeOrder({
        tipAmount: D(20),
        total: D(120),
        paidTotal: D(110),
        paymentCount: 1,
      }),
    );
    await expect(tip.execute('order-1', 0, 'u')).rejects.toThrow(
      ConflictException,
    );
  });
});
