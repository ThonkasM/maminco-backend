import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditOrdersQueryDto,
  ListOrdersQueryDto,
  OrderResponseDto,
  PaginatedAuditOrdersDto,
  PaginatedOrderResponseDto,
} from '../dto';
import { ORDER_QUERY_REPOSITORY } from './ports/order-query.repository';
import type {
  OrderHistoryPage,
  OrderQueryRepository,
  RevenueStats,
  TableState,
} from './ports/order-query.repository';
import { buildTimeline } from './order-timeline';
import { BUSINESS_CALENDAR } from './ports/business-calendar';
import type { BusinessCalendar } from './ports/business-calendar';
import { actionsOfGroup } from '../domain/audit-actions';

@Injectable()
export class OrdersQueryService {
  constructor(
    @Inject(ORDER_QUERY_REPOSITORY)
    private readonly queries: OrderQueryRepository,
    @Inject(BUSINESS_CALENDAR) private readonly calendar: BusinessCalendar,
  ) {}

  async findAll(query: ListOrdersQueryDto): Promise<PaginatedOrderResponseDto> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const { data, total } = await this.queries.search(query);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Orders with activity in a range of business dates, plus who changed each one. */
  async audit(query: AuditOrdersQueryDto): Promise<PaginatedAuditOrdersDto> {
    const today = await this.calendar.today();
    const from = query.from ?? today;
    const to = query.to ?? from;
    const [first, last] = from <= to ? [from, to] : [to, from];
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { start, end } = await this.calendar.bounds(first, last);
    const { data, total } = await this.queries.searchAudit({
      start,
      end,
      userId: query.userId,
      status: query.status,
      search: query.search?.trim() || undefined,
      actions: query.actionGroup
        ? actionsOfGroup(query.actionGroup)
        : undefined,
      page,
      limit,
    });
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      from: first,
      to: last,
    };
  }

  async findById(id: string): Promise<OrderResponseDto> {
    const order = await this.queries.findView(id);
    if (!order) throw new NotFoundException('Orden no encontrada');
    return order;
  }

  getActiveOrderByTable(tableId: string): Promise<OrderResponseDto | null> {
    return this.queries.findActiveViewByTable(tableId);
  }

  getKitchenOrders(): Promise<OrderResponseDto[]> {
    return this.queries.findKitchenViews();
  }

  getAllTablesState(): Promise<TableState[]> {
    return this.queries.listTablesState();
  }

  async getTableState(tableId: string): Promise<TableState> {
    const state = await this.queries.findTableState(tableId);
    if (!state) throw new NotFoundException('Mesa no encontrada');
    return state;
  }

  async getOrderHistory(
    orderId: string,
    page = 1,
    limit = 50,
  ): Promise<OrderHistoryPage> {
    const result = await this.queries.getHistoryPage(orderId, page, limit);
    if (!result) throw new NotFoundException('Orden no encontrada');
    return result;
  }

  async getOrderHistoryTimeline(orderId: string, page = 1, limit = 50) {
    return buildTimeline(await this.getOrderHistory(orderId, page, limit));
  }

  getRevenueStats(): Promise<RevenueStats> {
    return this.queries.getRevenueStats();
  }

  getOrdersByStatus() {
    return this.queries.countByStatus();
  }

  getOrdersByServiceType() {
    return this.queries.countByServiceType();
  }
}
