import { BadRequestException } from '@nestjs/common';
import {
  FakeOrderEvents,
  FakeOrderRepository,
  makeOrder,
} from '../testing/fakes';
import { ChangeKitchenStatusUseCase } from './change-kitchen-status.use-case';

function setup() {
  const repo = new FakeOrderRepository();
  const events = new FakeOrderEvents();
  return {
    repo,
    events,
    useCase: new ChangeKitchenStatusUseCase(repo, events),
  };
}

describe('ChangeKitchenStatusUseCase', () => {
  it('rejects kitchen changes on non-DRAFT orders', async () => {
    const { repo, events, useCase } = setup();
    repo.seed(makeOrder({ status: 'CLOSED' }));
    await expect(
      useCase.execute('order-1', { status: 'PREPARING' }, 'cook'),
    ).rejects.toThrow(BadRequestException);
    expect(events.events).toHaveLength(0);
  });

  it('is a no-op when the status does not change', async () => {
    const { repo, events, useCase } = setup();
    repo.seed(makeOrder());
    const order = await useCase.execute(
      'order-1',
      { status: 'PENDING' },
      'cook',
    );
    expect(order.kitchenStatus).toBe('PENDING');
    expect(events.events).toHaveLength(0);
    expect(repo.histories).toHaveLength(0);
  });

  it('follows PENDING -> PREPARING -> READY and records history', async () => {
    const { repo, events, useCase } = setup();
    repo.seed(makeOrder());
    await useCase.execute('order-1', { status: 'PREPARING' }, 'cook');
    const order = await useCase.execute('order-1', { status: 'READY' }, 'cook');
    expect(order.kitchenStatus).toBe('READY');
    expect(events.events).toHaveLength(2);
    expect(repo.histories.map((h) => h.action)).toEqual([
      'KITCHEN_STATUS_CHANGED',
      'KITCHEN_STATUS_CHANGED',
    ]);
  });

  it('rejects transitions the state diagram does not allow', async () => {
    const { repo, useCase } = setup();
    repo.seed(makeOrder());
    await expect(
      useCase.execute('order-1', { status: 'READY' }, 'cook'),
    ).rejects.toThrow(BadRequestException);
    repo.seed(makeOrder({ kitchenStatus: 'READY' }));
    await expect(
      useCase.execute('order-1', { status: 'PENDING' }, 'cook'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      useCase.execute('order-1', { status: 'PREPARING' }, 'cook'),
    ).resolves.toMatchObject({ kitchenStatus: 'PREPARING' });
  });
});
