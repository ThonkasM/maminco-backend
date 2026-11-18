import { AuditOrderDto, ListOrdersQueryDto, OrderResponseDto } from '../../dto';

export const ORDER_QUERY_REPOSITORY = Symbol('ORDER_QUERY_REPOSITORY');

export interface TableState {
  id: string;
  number: number;
  status: string;
  areaId?: string;
  areaName?: string;
  hasActiveOrder: boolean;
  currentOrderTotal: number;
  itemCount: number;
  createdByName?: string;
  createdAt?: Date;
}

export interface OrderHistoryRow {
  id: string;
  action: string;
  description: string;
  metadata: Record<string, any> | null;
  user: { id: string; name: string; email: string };
  createdAt: Date;
}

export interface OrderHistoryPage {
  id: string;
  orderNumber: string;
  status: string;
  tableName: string;
  areaName?: string;
  createdAt: Date;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  history: Array<OrderHistoryRow & { timestamp: string }>;
}

export interface RevenueStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  totalDiscount: number;
  totalTip: number;
}

export interface AuditSearch {
  start: Date;
  end: Date;
  userId?: string;
  status?: string;
  search?: string;
  actions?: readonly string[];
  page: number;
  limit: number;
}

export interface OrderQueryRepository {
  searchAudit(
    filter: AuditSearch,
  ): Promise<{ data: AuditOrderDto[]; total: number }>;
  search(
    query: ListOrdersQueryDto,
  ): Promise<{ data: OrderResponseDto[]; total: number }>;
  findView(orderId: string): Promise<OrderResponseDto | null>;
  findActiveViewByTable(tableId: string): Promise<OrderResponseDto | null>;
  findKitchenViews(): Promise<OrderResponseDto[]>;
  listTablesState(): Promise<TableState[]>;
  findTableState(tableId: string): Promise<TableState | null>;
  getHistoryPage(
    orderId: string,
    page: number,
    limit: number,
  ): Promise<OrderHistoryPage | null>;
  getRevenueStats(): Promise<RevenueStats>;
  countByStatus(): Promise<Array<{ status: string; count: number }>>;
  countByServiceType(): Promise<
    Array<{ serviceType: string; count: number; totalRevenue: number }>
  >;
}
