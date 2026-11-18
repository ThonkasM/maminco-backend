import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderResponseDto } from '../dto';
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
} from '../application/ports/order.repository';
import { OrderStatusValue } from '../domain/order-status.machine';
import { KitchenStatusValue } from '../domain/kitchen-status.machine';
import { lockOrderRow, lockTableRow, releaseTableIfIdle } from './order-locks';
import { mapOrderToResponse, ORDER_INCLUDE } from './order.mapper';

class PrismaOrderTransaction implements OrderTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async lockOrder(orderId: string): Promise<OrderSnapshot | null> {
    await lockOrderRow(this.tx, orderId);
    const order = await this.tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    if (!order) return null;

    const paid = await this.tx.payment.aggregate({
      where: { orderId },
      _sum: { amountApplied: true },
      _count: true,
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      kitchenStatus: order.kitchenStatus,
      tableId: order.tableId,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      tipAmount: order.tipAmount,
      total: order.total,
      paidTotal: paid._sum.amountApplied ?? new Prisma.Decimal(0),
      paymentCount: paid._count,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
      })),
    };
  }

  lockTable(tableId: string): Promise<void> {
    return lockTableRow(this.tx, tableId);
  }

  async hasOpenOrder(tableId: string): Promise<boolean> {
    const open = await this.tx.order.count({
      where: { tableId, status: 'DRAFT', deletedAt: null },
    });
    return open > 0;
  }

  async nextOrderNumber(): Promise<bigint> {
    const rows = await this.tx.$queryRaw<
      Array<{ value: bigint }>
    >`SELECT nextval('order_number_seq') AS value`;
    return BigInt(rows[0].value);
  }

  findProducts(ids: string[]): Promise<ProductSnapshot[]> {
    return this.tx.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        price: true,
        isAvailable: true,
        deletedAt: true,
      },
    });
  }

  async insertOrder(order: NewOrder): Promise<string> {
    const created = await this.tx.order.create({
      data: {
        orderNumber: order.orderNumber,
        status: 'DRAFT',
        serviceType: order.serviceType,
        table: { connect: { id: order.tableId } },
        createdBy: { connect: { id: order.createdById } },
        attendedBy: { connect: { id: order.attendedById } },
        subtotal: order.subtotal,
        discountAmount: new Prisma.Decimal(0),
        tipAmount: new Prisma.Decimal(0),
        total: order.subtotal,
        items: { create: order.lines.map((line) => this.toItemCreate(line)) },
        histories: {
          create: {
            action: 'CREATED',
            description: order.historyDescription,
            user: { connect: { id: order.createdById } },
          },
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  async insertItem(orderId: string, line: NewOrderLine): Promise<string> {
    const item = await this.tx.orderItem.create({
      data: { ...this.toItemCreate(line), order: { connect: { id: orderId } } },
      select: { id: true },
    });
    return item.id;
  }

  async updateItem(
    itemId: string,
    data: {
      quantity: number;
      subtotal: Prisma.Decimal;
      notes?: string;
      modifiedById: string;
    },
  ): Promise<void> {
    await this.tx.orderItem.update({
      where: { id: itemId },
      data: {
        quantity: data.quantity,
        subtotal: data.subtotal,
        notes: data.notes,
        addedBy: { connect: { id: data.modifiedById } },
      },
    });
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.tx.orderItem.delete({ where: { id: itemId } });
  }

  async updateTotals(
    orderId: string,
    totals: OrderTotalsUpdate,
  ): Promise<void> {
    await this.tx.order.update({ where: { id: orderId }, data: totals });
  }

  async transitionStatus(
    orderId: string,
    from: OrderStatusValue,
    to: OrderStatusValue,
    closedById: string | null,
  ): Promise<boolean> {
    const result = await this.tx.order.updateMany({
      where: { id: orderId, status: from },
      data: {
        status: to,
        closedAt: to === 'CLOSED' ? new Date() : null,
        ...(closedById ? { closedById } : {}),
      },
    });
    return result.count === 1;
  }

  async setKitchenStatus(
    orderId: string,
    status: KitchenStatusValue,
  ): Promise<void> {
    await this.tx.order.update({
      where: { id: orderId },
      data: { kitchenStatus: status },
    });
  }

  async occupyTable(tableId: string): Promise<void> {
    await this.tx.table.update({
      where: { id: tableId },
      data: { status: 'OCCUPIED' },
    });
  }

  releaseTableIfIdle(tableId: string): Promise<boolean> {
    return releaseTableIfIdle(this.tx, tableId);
  }

  async addHistory(entry: OrderHistoryEntry): Promise<void> {
    await this.tx.orderHistory.create({
      data: {
        action: entry.action,
        description: entry.description,
        metadata: entry.metadata,
        order: { connect: { id: entry.orderId } },
        user: { connect: { id: entry.userId } },
      },
    });
  }

  private toItemCreate(line: NewOrderLine) {
    return {
      product: { connect: { id: line.productId } },
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      discountAmount: new Prisma.Decimal(0),
      notes: line.notes,
      addedBy: { connect: { id: line.addedById } },
    };
  }
}

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) =>
      work(new PrismaOrderTransaction(tx)),
    );
  }

  async findView(orderId: string): Promise<OrderResponseDto | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    return order ? mapOrderToResponse(order) : null;
  }

  async findTable(tableId: string): Promise<TableSnapshot | null> {
    const table = await this.prisma.table.findUnique({
      where: { id: tableId },
      include: { area: true },
    });
    if (!table) return null;
    return {
      id: table.id,
      number: table.number,
      areaId: table.areaId,
      areaName: table.area?.name ?? null,
      deletedAt: table.deletedAt,
    };
  }

  findUser(userId: string): Promise<UserSnapshot | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, deletedAt: true },
    });
  }
}
