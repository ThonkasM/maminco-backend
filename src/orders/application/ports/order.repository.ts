import { Prisma } from '@prisma/client';
import { OrderResponseDto } from '../../dto';
import { KitchenStatusValue } from '../../domain/kitchen-status.machine';
import { OrderStatusValue } from '../../domain/order-status.machine';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface OrderItemSnapshot {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
}

export interface OrderSnapshot {
  id: string;
  orderNumber: string;
  status: OrderStatusValue;
  kitchenStatus: KitchenStatusValue;
  tableId: string;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  tipAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  paidTotal: Prisma.Decimal;
  paymentCount: number;
  items: OrderItemSnapshot[];
}

export interface ProductSnapshot {
  id: string;
  name: string;
  price: Prisma.Decimal;
  isAvailable: boolean;
  deletedAt: Date | null;
}

export interface TableSnapshot {
  id: string;
  number: number;
  areaId: string | null;
  areaName: string | null;
  deletedAt: Date | null;
}

export interface UserSnapshot {
  id: string;
  name: string;
  deletedAt: Date | null;
}

export interface NewOrderLine {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  notes?: string | null;
  addedById: string;
}

export interface NewOrder {
  orderNumber: string;
  tableId: string;
  serviceType: string;
  createdById: string;
  attendedById: string;
  subtotal: Prisma.Decimal;
  lines: NewOrderLine[];
  historyDescription: string;
}

export interface OrderTotalsUpdate {
  subtotal?: Prisma.Decimal;
  discountAmount?: Prisma.Decimal;
  tipAmount?: Prisma.Decimal;
  total: Prisma.Decimal;
  kitchenStatus?: KitchenStatusValue;
}

export interface OrderHistoryEntry {
  orderId: string;
  userId: string;
  action: string;
  description: string;
  metadata?: Prisma.InputJsonObject;
}

export interface OrderTransaction {
  lockOrder(orderId: string): Promise<OrderSnapshot | null>;
  lockTable(tableId: string): Promise<void>;
  hasOpenOrder(tableId: string): Promise<boolean>;
  nextOrderNumber(): Promise<bigint>;
  findProducts(ids: string[]): Promise<ProductSnapshot[]>;
  insertOrder(order: NewOrder): Promise<string>;
  insertItem(orderId: string, line: NewOrderLine): Promise<string>;
  updateItem(
    itemId: string,
    data: {
      quantity: number;
      subtotal: Prisma.Decimal;
      notes?: string;
      modifiedById: string;
    },
  ): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  updateTotals(orderId: string, totals: OrderTotalsUpdate): Promise<void>;
  transitionStatus(
    orderId: string,
    from: OrderStatusValue,
    to: OrderStatusValue,
    closedById: string | null,
  ): Promise<boolean>;
  setKitchenStatus(orderId: string, status: KitchenStatusValue): Promise<void>;
  occupyTable(tableId: string): Promise<void>;
  releaseTableIfIdle(tableId: string): Promise<boolean>;
  addHistory(entry: OrderHistoryEntry): Promise<void>;
}

export interface OrderRepository {
  transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T>;
  findView(orderId: string): Promise<OrderResponseDto | null>;
  findTable(tableId: string): Promise<TableSnapshot | null>;
  findUser(userId: string): Promise<UserSnapshot | null>;
}
