import type { OrderResponseDto } from '../dto';
import type { OrderEvent } from '../application/ports/order-events.publisher';
import type { OrderQueryRepository } from '../application/ports/order-query.repository';
import type { OrdersGateway } from '../orders.gateway';
import { SocketOrderEventsPublisher } from './socket-order-events.publisher';

function setup() {
  const calls: string[] = [];
  const gateway = {
    emitOrderCreated: jest.fn(() => calls.push('created')),
    emitOrderStatusChanged: jest.fn(() => calls.push('status')),
    emitTableStateUpdated: jest.fn(),
    emitTableStatusChanged: jest.fn(),
    emitAllTablesState: jest.fn(() => calls.push('snapshot')),
  };
  const queries = {
    listTablesState: jest.fn().mockResolvedValue([]),
  };
  const publisher = new SocketOrderEventsPublisher(
    gateway as unknown as OrdersGateway,
    queries as unknown as OrderQueryRepository,
  );
  return { publisher, gateway, queries, calls };
}

const view = (status = 'DRAFT') =>
  ({
    id: 'order-1',
    orderNumber: '000001',
    tableId: 'table-1',
    tableName: '1',
    areaId: 'area-1',
    serviceType: 'SALON',
    status,
    total: 10,
    discountAmount: 0,
    tipAmount: 0,
  }) as unknown as OrderResponseDto;

const created = (): OrderEvent => ({
  type: 'order.created',
  order: view(),
});
const closed = (): OrderEvent => ({
  type: 'order.status.changed',
  order: view('CLOSED'),
  status: 'CLOSED',
  tableReleased: true,
});

describe('SocketOrderEventsPublisher', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not wait for the table snapshot query', async () => {
    const { publisher, queries, gateway } = setup();
    queries.listTablesState.mockReturnValue(new Promise(() => undefined));
    await publisher.publish(closed());
    await jest.advanceTimersByTimeAsync(100);
    expect(gateway.emitOrderStatusChanged).toHaveBeenCalledTimes(1);
    expect(queries.listTablesState).toHaveBeenCalledTimes(1);
    expect(gateway.emitAllTablesState).not.toHaveBeenCalled();
  });

  it('dispatches events in the order they were published', async () => {
    const { publisher, calls } = setup();
    await publisher.publish(created());
    await publisher.publish(closed());
    await jest.advanceTimersByTimeAsync(100);
    expect(calls.filter((c) => c !== 'snapshot')).toEqual([
      'created',
      'status',
    ]);
  });

  it('coalesces a burst of events into a single table snapshot', async () => {
    const { publisher, queries, gateway } = setup();
    await publisher.publish(created());
    await publisher.publish(closed());
    await publisher.publish(created());
    await jest.advanceTimersByTimeAsync(100);
    expect(queries.listTablesState).toHaveBeenCalledTimes(1);
    expect(gateway.emitAllTablesState).toHaveBeenCalledTimes(1);
  });

  it('keeps dispatching after a failing event', async () => {
    const { publisher, gateway } = setup();
    gateway.emitOrderCreated.mockImplementationOnce(() => {
      throw new Error('socket down');
    });
    await publisher.publish(created());
    await publisher.publish(closed());
    await jest.advanceTimersByTimeAsync(100);
    expect(gateway.emitOrderStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('survives a failing snapshot query', async () => {
    const { publisher, queries, gateway } = setup();
    queries.listTablesState.mockRejectedValueOnce(new Error('db down'));
    await publisher.publish(created());
    await jest.advanceTimersByTimeAsync(100);
    expect(gateway.emitAllTablesState).not.toHaveBeenCalled();
    await publisher.publish(created());
    await jest.advanceTimersByTimeAsync(100);
    expect(gateway.emitAllTablesState).toHaveBeenCalledTimes(1);
  });
});
