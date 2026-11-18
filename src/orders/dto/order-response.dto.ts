import { OrderKitchenStatus, OrderStatus } from '@prisma/client';

export class OrderItemResponseDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  notes?: string | null;
  addedById: string;
  addedByName: string;
  createdAt: Date;
}

export class OrderResponseDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  kitchenStatus: OrderKitchenStatus;
  serviceType: string; // Area.name
  subtotal: number;
  discountAmount: number;
  tipAmount: number;
  total: number;

  tableId: string;
  tableName: string;
  areaId: string;
  createdById: string;
  createdByName: string;
  attendedById?: string | null;
  attendedByName?: string;
  closedById?: string | null;
  closedByName?: string;
  items: OrderItemResponseDto[];
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
}
