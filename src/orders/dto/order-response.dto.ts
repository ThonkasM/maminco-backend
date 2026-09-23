import { OrderStatus } from '@prisma/client';

export class OrderItemResponseDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  notes?: string;
  addedById: string;
  addedByName: string;
  createdAt: Date;
}

export class OrderResponseDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  serviceType: string; // Area.name

  // Montos
  subtotal: number;
  discountAmount: number;
  tipAmount: number;
  total: number;

  // Mesa
  tableId: string;
  tableName: string;
  areaId: string;

  // Usuarios
  createdById: string;
  createdByName: string;
  attendedById?: string;
  attendedByName?: string;
  closedById?: string;
  closedByName?: string;

  // Items
  items: OrderItemResponseDto[];
  itemCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}
