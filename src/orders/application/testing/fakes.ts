/* eslint-disable @typescript-eslint/require-await */
import { Prisma } from '@prisma/client';
import { OrderResponseDto } from '../../dto';
import {
  NewOrder,
  NewOrderLine,
  OrderHistoryEntry,
  OrderRepository,
  OrderSnapshot,
  OrderTotalsUpdate,
  OrderTransaction,
  ProductSnapshot,
  TableSnapshot,
  UserSnapshot,
} from '../ports/order.repository';
import {
  OrderEvent,
  OrderEventsPublisher,
} from '../ports/order-events.publisher';
import { OrderStatusValue } from '../../domain/order-status.machine';
import { KitchenStatusValue } from '../../domain/kitchen-status.machine';

export const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

export function makeOrder(
  overrides: Partial<OrderSnapshot> = {},
): OrderSnapshot {
  return {
    id: 'order-1',
    orderNumber: '000001',
    status: 'DRAFT',
    kitchenStatus: 'PENDING',
    tableId: 'table-1',
    subtotal: D(100),
    discountAmount: D(0),
    tipAmount: D(0),
    total: D(100),
    paidTotal: D(0),
    paymentCount: 0,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        productName: 'Pato',
        quantity: 2,
        unitPrice: D(50),
        discountAmount: D(0),
      },
    ],
    ...overrides,
  };
}

export class FakeOrderRepository implements OrderRepository {
  orders = new Map<string, OrderSnapshot>();
  tableStatus = new Map<string, string>([['table-1', 'AVAILABLE']]);
  tables = new Map<string, TableSnapshot>([
    [
      'table-1',
      {
        id: 'table-1',
        number: 3,
        areaId: 'area-1',
        areaName: 'Salón',
        deletedAt: null,
      },
    ],
  ]);
  users = new Map<string, UserSnapshot>([
    ['user-1', { id: 'user-1', name: 'Mesero', deletedAt: null }],
  ]);
  products = new Map<string, ProductSnapshot>([
    [
      'product-1',
      {
        id: 'product-1',
        name: 'Pato',
        price: D(50),
        isAvailable: true,
        deletedAt: null,
      },
    ],
  ]);
  histories: OrderHistoryEntry[] = [];
  closedBy = new Map<string, string | null>();
  sequence = 0;
  rejectTransition = false;
  private itemSeq = 0;

  seed(order: OrderSnapshot) {
    this.orders.set(order.id, order);
    return order;
  }

  async transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    const backup = {
      orders: new Map(
        [...this.orders].map(([k, v]) => [
          k,
          { ...v, items: v.items.map((i) => ({ ...i })) },
        ]),
      ),
      tableStatus: new Map(this.tableStatus),
      histories: [...this.histories],
    };
    try {
      return await work(this.tx());
    } catch (error) {
      Object.assign(this, backup);
      throw error;
    }
  }

  async findView(orderId: string): Promise<OrderResponseDto | null> {
    const order = this.orders.get(orderId);
    if (!order) return null;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      kitchenStatus: order.kitchenStatus,
      serviceType: 'Salón',
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      tipAmount: Number(order.tipAmount),
      total: Number(order.total),
      tableId: order.tableId,
      tableName: '3',
      areaId: 'area-1',
      createdById: 'user-1',
      createdByName: 'Mesero',
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        discountAmount: Number(i.discountAmount),
        subtotal: Number(i.unitPrice.mul(i.quantity)),
        addedById: 'user-1',
        addedByName: 'Mesero',
        createdAt: new Date(0),
      })),
      itemCount: order.items.length,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  async findTable(tableId: string) {
    return this.tables.get(tableId) ?? null;
  }

  async findUser(userId: string) {
    return this.users.get(userId) ?? null;
  }

  private hasOpen(tableId: string) {
    return [...this.orders.values()].some(
      (o) => o.tableId === tableId && o.status === 'DRAFT',
    );
  }

  private tx(): OrderTransaction {
    const get = (id: string) => this.orders.get(id) as OrderSnapshot;
    return {
      lockOrder: async (id) => {
        const order = this.orders.get(id);
        return order
          ? { ...order, items: order.items.map((i) => ({ ...i })) }
          : null;
      },
      lockTable: async () => undefined,
      hasOpenOrder: async (tableId) => this.hasOpen(tableId),
      nextOrderNumber: async () => BigInt(++this.sequence),
      findProducts: async (ids) =>
        ids.flatMap((id) =>
          this.products.has(id) ? [this.products.get(id)!] : [],
        ),
      insertOrder: async (input: NewOrder) => {
        const id = `order-${this.orders.size + 1}`;
        this.orders.set(
          id,
          makeOrder({
            id,
            orderNumber: input.orderNumber,
            tableId: input.tableId,
            subtotal: input.subtotal,
            total: input.subtotal,
            items: input.lines.map((l) => ({
              id: `item-${++this.itemSeq}`,
              productId: l.productId,
              productName: this.products.get(l.productId)?.name ?? '',
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: D(0),
            })),
          }),
        );
        return id;
      },
      insertItem: async (orderId: string, line: NewOrderLine) => {
        const id = `new-item-${++this.itemSeq}`;
        get(orderId).items.push({
          id,
          productId: line.productId,
          productName: this.products.get(line.productId)?.name ?? '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: D(0),
        });
        return id;
      },
      updateItem: async (itemId, data) => {
        for (const order of this.orders.values()) {
          const item = order.items.find((i) => i.id === itemId);
          if (item) item.quantity = data.quantity;
        }
      },
      deleteItem: async (itemId) => {
        for (const order of this.orders.values()) {
          order.items = order.items.filter((i) => i.id !== itemId);
        }
      },
      updateTotals: async (id: string, totals: OrderTotalsUpdate) => {
        Object.assign(get(id), totals);
      },
      transitionStatus: async (
        id: string,
        from: OrderStatusValue,
        to: OrderStatusValue,
        closedById: string | null,
      ) => {
        if (this.rejectTransition || get(id).status !== from) return false;
        get(id).status = to;
        this.closedBy.set(id, closedById);
        return true;
      },
      setKitchenStatus: async (id: string, status: KitchenStatusValue) => {
        get(id).kitchenStatus = status;
      },
      occupyTable: async (tableId) => {
        this.tableStatus.set(tableId, 'OCCUPIED');
      },
      releaseTableIfIdle: async (tableId) => {
        if (this.hasOpen(tableId)) return false;
        this.tableStatus.set(tableId, 'AVAILABLE');
        return true;
      },
      addHistory: async (entry) => {
        this.histories.push(entry);
      },
    };
  }
}

export class FakeOrderEvents implements OrderEventsPublisher {
  events: OrderEvent[] = [];
  async publish(event: OrderEvent) {
    this.events.push(event);
  }
}
