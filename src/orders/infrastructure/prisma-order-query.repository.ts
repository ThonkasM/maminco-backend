import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditOrderDto, ListOrdersQueryDto, OrderResponseDto } from '../dto';
import { summarizeChanges } from '../domain/audit-actions';
import {
  AuditSearch,
  OrderHistoryPage,
  OrderQueryRepository,
  RevenueStats,
  TableState,
} from '../application/ports/order-query.repository';
import { mapOrderToResponse, ORDER_INCLUDE } from './order.mapper';

const TABLE_STATE_INCLUDE = {
  area: { select: { id: true, name: true } },
  orders: {
    where: { status: 'DRAFT', deletedAt: null },
    include: { items: true, createdBy: { select: { name: true } } },
    take: 1,
  },
} satisfies Prisma.TableInclude;

type TableWithState = Prisma.TableGetPayload<{
  include: typeof TABLE_STATE_INCLUDE;
}>;

function toTableState(table: TableWithState): TableState {
  const active = table.orders[0];
  return {
    id: table.id,
    number: table.number,
    status: table.status,
    areaId: table.area?.id,
    areaName: table.area?.name,
    hasActiveOrder: !!active,
    currentOrderTotal: active ? Number(active.total) : 0,
    itemCount: active ? active.items.length : 0,
    createdByName: active?.createdBy?.name,
    createdAt: active?.createdAt,
  };
}

@Injectable()
export class PrismaOrderQueryRepository implements OrderQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: ListOrdersQueryDto,
  ): Promise<{ data: OrderResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 10;

    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.kitchenStatus) where.kitchenStatus = query.kitchenStatus;
    if (query.tableId) where.tableId = query.tableId;
    if (query.serviceType) where.serviceType = query.serviceType;
    if (query.createdById) where.createdById = query.createdById;
    if (query.onlyOpen) where.status = { in: ['DRAFT'] };

    const orderBy: Prisma.OrderOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder || 'desc',
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: ORDER_INCLUDE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data: orders.map(mapOrderToResponse), total };
  }

  async searchAudit(
    filter: AuditSearch,
  ): Promise<{ data: AuditOrderDto[]; total: number }> {
    const range = { gte: filter.start, lt: filter.end };
    const and: Prisma.OrderWhereInput[] = [
      {
        OR: [
          { createdAt: range },
          { closedAt: range },
          { histories: { some: { createdAt: range } } },
        ],
      },
    ];
    if (filter.status) and.push({ status: filter.status as OrderStatus });
    if (filter.search) {
      and.push({
        orderNumber: { contains: filter.search, mode: 'insensitive' },
      });
    }
    if (filter.userId) {
      and.push({
        OR: [
          { createdById: filter.userId },
          { histories: { some: { userId: filter.userId } } },
        ],
      });
    }
    if (filter.actions) {
      and.push({
        histories: { some: { action: { in: [...filter.actions] } } },
      });
    }
    const where: Prisma.OrderWhereInput = { AND: and };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
          closedAt: true,
          createdBy: { select: { name: true } },
          table: { select: { number: true, area: { select: { name: true } } } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    const histories = orders.length
      ? await this.prisma.orderHistory.findMany({
          where: { orderId: { in: orders.map((order) => order.id) } },
          select: {
            orderId: true,
            userId: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        })
      : [];
    const byOrder = new Map<string, typeof histories>();
    for (const row of histories) {
      const list = byOrder.get(row.orderId) ?? [];
      list.push(row);
      byOrder.set(row.orderId, list);
    }

    const data = orders.map((order): AuditOrderDto => {
      const summary = summarizeChanges(
        (byOrder.get(order.id) ?? []).map((row) => ({
          userId: row.userId,
          userName: row.user.name,
          createdAt: row.createdAt,
        })),
      );
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        tableName: `Mesa ${order.table?.number}`,
        areaName: order.table?.area?.name ?? null,
        total: Number(order.total),
        createdAt: order.createdAt,
        closedAt: order.closedAt,
        createdByName: order.createdBy.name,
        ...summary,
      };
    });
    return { data, total };
  }

  async findView(orderId: string): Promise<OrderResponseDto | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    return order ? mapOrderToResponse(order) : null;
  }

  async findActiveViewByTable(
    tableId: string,
  ): Promise<OrderResponseDto | null> {
    const order = await this.prisma.order.findFirst({
      where: { tableId, status: 'DRAFT', deletedAt: null },
      include: ORDER_INCLUDE,
    });
    return order ? mapOrderToResponse(order) : null;
  }

  async findKitchenViews(): Promise<OrderResponseDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { status: 'DRAFT', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: ORDER_INCLUDE,
    });
    return orders.map(mapOrderToResponse);
  }

  async listTablesState(): Promise<TableState[]> {
    const tables = await this.prisma.table.findMany({
      where: { deletedAt: null },
      include: TABLE_STATE_INCLUDE,
      orderBy: { number: 'asc' },
    });
    return tables.map(toTableState);
  }

  async findTableState(tableId: string): Promise<TableState | null> {
    const table = await this.prisma.table.findUnique({
      where: { id: tableId },
      include: TABLE_STATE_INCLUDE,
    });
    return table ? toTableState(table) : null;
  }

  async getHistoryPage(
    orderId: string,
    page: number,
    limit: number,
  ): Promise<OrderHistoryPage | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        table: { select: { number: true, area: { select: { name: true } } } },
      },
    });
    if (!order) return null;

    const safePage = page < 1 ? 1 : page;
    const safeLimit = limit < 1 || limit > 500 ? 50 : limit;

    const [total, history] = await Promise.all([
      this.prisma.orderHistory.count({ where: { orderId } }),
      this.prisma.orderHistory.findMany({
        where: { orderId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);
    const totalPages = Math.ceil(total / safeLimit);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      tableName: `Mesa ${order.table?.number}`,
      areaName: order.table?.area?.name,
      createdAt: order.createdAt,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
      },
      history: history.map((entry) => ({
        id: entry.id,
        action: entry.action,
        description: entry.description,
        metadata: entry.metadata as Record<string, any> | null,
        user: entry.user,
        createdAt: entry.createdAt,
        timestamp: entry.createdAt.toLocaleTimeString('es-BO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      })),
    };
  }

  async getRevenueStats(): Promise<RevenueStats> {
    const agg = await this.prisma.order.aggregate({
      where: { status: 'CLOSED' },
      _count: true,
      _sum: { total: true, discountAmount: true, tipAmount: true },
    });
    const totalOrders = agg._count;
    const totalRevenue = agg._sum.total ?? new Prisma.Decimal(0);

    return {
      totalOrders,
      totalRevenue: Number(totalRevenue),
      averageOrderValue:
        totalOrders > 0
          ? Number(
              totalRevenue
                .div(totalOrders)
                .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
            )
          : 0,
      totalDiscount: Number(agg._sum.discountAmount ?? 0),
      totalTip: Number(agg._sum.tipAmount ?? 0),
    };
  }

  async countByStatus(): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      _count: true,
    });
    return rows.map((row) => ({ status: row.status, count: row._count }));
  }

  async countByServiceType(): Promise<
    Array<{ serviceType: string; count: number; totalRevenue: number }>
  > {
    const rows = await this.prisma.order.groupBy({
      by: ['serviceType'],
      _count: true,
      _sum: { total: true },
    });
    return rows.map((row) => ({
      serviceType: row.serviceType,
      count: row._count,
      totalRevenue: Number(row._sum.total) || 0,
    }));
  }
}
