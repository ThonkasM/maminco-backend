import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  FakeOrderEvents,
  FakeOrderRepository,
  makeOrder,
} from '../testing/fakes';
import { CreateOrderUseCase } from './create-order.use-case';

function setup() {
  const repo = new FakeOrderRepository();
  const events = new FakeOrderEvents();
  return { repo, events, useCase: new CreateOrderUseCase(repo, events) };
}

describe('CreateOrderUseCase', () => {
  it('creates the order, occupies the table and publishes after commit', async () => {
    const { repo, events, useCase } = setup();

    const order = await useCase.execute(
      {
        tableId: 'table-1',
        initialItems: [{ productId: 'product-1', quantity: 2 }],
      },
      'user-1',
    );

    expect(order.orderNumber).toBe('000001');
    expect(order.subtotal).toBe(100);
    expect(order.total).toBe(100);
    expect(repo.tableStatus.get('table-1')).toBe('OCCUPIED');
    expect(events.events.map((e) => e.type)).toEqual(['order.created']);
  });

  it('creates an empty order', async () => {
    const { useCase } = setup();
    const order = await useCase.execute({ tableId: 'table-1' }, 'user-1');
    expect(order.total).toBe(0);
    expect(order.itemCount).toBe(0);
  });

  it('requires a creator', async () => {
    const { useCase } = setup();
    await expect(useCase.execute({ tableId: 'table-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('falls back to dto.createdById', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ tableId: 'table-1', createdById: 'user-1' }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['unknown table', 'nope', 'user-1', undefined],
    ['unknown creator', 'table-1', 'ghost', undefined],
    ['unknown attendant', 'table-1', 'user-1', 'ghost'],
  ])('rejects %s', async (_label, tableId, actor, attendedById) => {
    const { useCase, events } = setup();
    await expect(
      useCase.execute({ tableId, attendedById }, actor),
    ).rejects.toThrow(NotFoundException);
    expect(events.events).toHaveLength(0);
  });

  it('rejects deleted tables and tables without area', async () => {
    const { repo, useCase } = setup();
    repo.tables.set('table-1', {
      ...repo.tables.get('table-1')!,
      deletedAt: new Date(),
    });
    await expect(
      useCase.execute({ tableId: 'table-1' }, 'user-1'),
    ).rejects.toThrow(NotFoundException);

    repo.tables.set('table-1', {
      ...repo.tables.get('table-1')!,
      deletedAt: null,
      areaName: null,
    });
    await expect(
      useCase.execute({ tableId: 'table-1' }, 'user-1'),
    ).rejects.toThrow('Mesa no tiene área asignada');
  });

  it('rejects unknown and unavailable products', async () => {
    const { repo, useCase } = setup();
    await expect(
      useCase.execute(
        { tableId: 'table-1', initialItems: [{ productId: 'x', quantity: 1 }] },
        'user-1',
      ),
    ).rejects.toThrow(NotFoundException);

    repo.products.set('product-1', {
      ...repo.products.get('product-1')!,
      isAvailable: false,
    });
    await expect(
      useCase.execute(
        {
          tableId: 'table-1',
          initialItems: [{ productId: 'product-1', quantity: 1 }],
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a second open order on the same table', async () => {
    const { repo, useCase } = setup();
    repo.seed(makeOrder());
    await expect(
      useCase.execute({ tableId: 'table-1' }, 'user-1'),
    ).rejects.toThrow(ConflictException);
  });
});
