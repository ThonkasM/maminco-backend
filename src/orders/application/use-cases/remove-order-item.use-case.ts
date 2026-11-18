import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderResponseDto } from '../../dto';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { calculateSubtotal, calculateTotal } from '../../domain/order-totals';
import { Actor, assertEditable } from '../order-guards';
import { ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';

export const WAITER_REMOVE_FLAG = 'waiter_can_remove_products';

@Injectable()
export class RemoveOrderItemUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async execute(
    orderId: string,
    itemId: string,
    actor: Actor,
  ): Promise<OrderResponseDto> {
    if (actor.role === 'WAITER') {
      const flags = await this.featureFlags.evaluate();
      if (flags[WAITER_REMOVE_FLAG] === false) {
        throw new ForbiddenException(
          'Los meseros no pueden quitar productos de una orden',
        );
      }
    }

    const productName = await this.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new NotFoundException('Orden no encontrada');
      assertEditable(order, 'eliminar items de');

      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('Item no encontrado en la orden');

      await tx.deleteItem(itemId);

      const remaining = order.items.filter((i) => i.id !== itemId);
      const subtotal = calculateSubtotal(remaining);
      await tx.updateTotals(orderId, {
        subtotal,
        total: calculateTotal(subtotal, order.discountAmount, order.tipAmount),
      });
      await tx.addHistory({
        orderId,
        userId: actor.id,
        action: 'ITEM_REMOVED',
        description: `Eliminado ${item.productName}`,
        metadata: { productId: item.productId, productName: item.productName },
      });
      return item.productName;
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    await this.events.publish({
      type: 'order.item.removed',
      order,
      itemId,
      productName,
    });
    return order;
  }
}
