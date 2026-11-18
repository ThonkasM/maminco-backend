import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OrderResponseDto, UpdateOrderItemDto } from '../../dto';
import {
  calculateSubtotal,
  calculateTotal,
  lineSubtotal,
} from '../../domain/order-totals';
import { Actor, assertEditable } from '../order-guards';
import { ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';
import { RemoveOrderItemUseCase } from './remove-order-item.use-case';

@Injectable()
export class UpdateOrderItemUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
    private readonly removeItem: RemoveOrderItemUseCase,
  ) {}

  async execute(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
    actor: Actor,
  ): Promise<OrderResponseDto> {
    if (dto.quantity < 1) {
      return this.removeItem.execute(orderId, itemId, actor);
    }

    const outcome = await this.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new NotFoundException('Orden no encontrada');
      assertEditable(order, 'actualizar items de');

      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('Item no encontrado en la orden');

      const itemSubtotal = lineSubtotal(item.unitPrice, dto.quantity);
      await tx.updateItem(itemId, {
        quantity: dto.quantity,
        subtotal: itemSubtotal,
        notes: dto.notes,
        modifiedById: actor.id,
      });

      const subtotal = calculateSubtotal(
        order.items.map((i) =>
          i.id === itemId ? { ...i, quantity: dto.quantity } : i,
        ),
      );
      await tx.updateTotals(orderId, {
        subtotal,
        total: calculateTotal(subtotal, order.discountAmount, order.tipAmount),
      });
      await tx.addHistory({
        orderId,
        userId: actor.id,
        action: 'ITEM_QUANTITY_UPDATED',
        description: `Cantidad actualizada en item ${itemId}: ${item.quantity} → ${dto.quantity}`,
        metadata: {
          itemId,
          productName: item.productName,
          oldQuantity: item.quantity,
          newQuantity: dto.quantity,
          unitPrice: Number(item.unitPrice),
        },
      });
      return { itemSubtotal };
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    const updated = order.items.find((i) => i.id === itemId);
    await this.events.publish({
      type: 'order.item.updated',
      order,
      itemId,
      quantity: dto.quantity,
      subtotal: Number(outcome.itemSubtotal),
      updatedByName: updated?.addedByName || 'Usuario',
    });
    return order;
  }
}
