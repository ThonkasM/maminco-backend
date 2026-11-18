export class AuditOrderDto {
  id: string;
  orderNumber: string;
  status: string;
  tableName: string;
  areaName: string | null;
  total: number;
  createdAt: Date;
  closedAt: Date | null;
  createdByName: string;
  changeCount: number;
  lastChangeAt: Date | null;
  lastChangeBy: string | null;
  users: { id: string; name: string; changes: number }[];
}

export class PaginatedAuditOrdersDto {
  data: AuditOrderDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  from: string;
  to: string;
}
