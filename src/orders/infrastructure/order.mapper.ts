import { Prisma } from '@prisma/client';
import { OrderResponseDto } from '../dto';

export const ORDER_INCLUDE = {
  table: { include: { area: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  attendedBy: { select: { id: true, name: true, email: true } },
  closedBy: { select: { id: true, name: true, email: true } },
  items: {
    include: {
      product: true,
      addedBy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;

export function mapOrderToResponse(
  order: OrderWithRelations,
): OrderResponseDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    kitchenStatus: order.kitchenStatus,
    serviceType: order.serviceType,
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discountAmount),
    tipAmount: Number(order.tipAmount),
    total: Number(order.total),
    tableId: order.tableId,
    tableName: order.table.number.toString(),
    areaId: order.table.areaId as string,
    createdById: order.createdById,
    createdByName: order.createdBy.name,
    attendedById: order.attendedById,
    attendedByName: order.attendedBy?.name,
    closedById: order.closedById,
    closedByName: order.closedBy?.name,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      discountAmount: Number(item.discountAmount),
      subtotal: Number(item.subtotal),
      notes: item.notes,
      addedById: item.addedById,
      addedByName: item.addedBy.name,
      createdAt: item.createdAt,
    })),
    itemCount: order.items.length,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    closedAt: order.closedAt,
  };
}
