import { TableStatus } from '@prisma/client';

export class TableResponseDto {
  id: string;
  number: number;
  status: TableStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  areaId: string;
  areaName?: string; // Nombre del área para comodidad
  ordersCount?: number; // Cantidad de órdenes asociadas

  constructor(table: any) {
    this.id = table.id;
    this.number = table.number;
    this.status = table.status;
    this.isActive = table.isActive;
    this.createdAt = table.createdAt;
    this.updatedAt = table.updatedAt;
    this.areaId = table.areaId;
    if (table.area?.name) {
      this.areaName = table.area.name;
    }
    if (table._count?.orders !== undefined) {
      this.ordersCount = table._count.orders;
    }
  }
}
