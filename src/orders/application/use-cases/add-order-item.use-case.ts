import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AddOrderItemDto, OrderResponseDto } from '../../dto';
import { kitchenStatusAfterItemAdded } from '../../domain/kitchen-status.machine';
import {
  calculateSubtotal,
  calculateTotal,
  lineSubtotal,
} from '../../domain/order-totals';
import { assertEditable } from '../order-guards';
import { ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';

@Injectable()
export class AddOrderItemUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
  ) {}

  async execute(
    orderId: string,
    dto: AddOrderItemDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    const outcome = await this.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new NotFoundException('Orden no encontrada');
      assertEditable(order, 'agregar items a');

      const [product] = await tx.findProducts([dto.productId]);
      if (!product || product.deletedAt) {
        throw new NotFoundException('Producto no encontrado');
      }
      if (!product.isAvailable) {
        throw new BadRequestException('Producto no disponible');
      }

      const subtotal = lineSubtotal(product.price, dto.quantity);
      const itemId = await tx.insertItem(orderId, {
        productId: product.id,
        quantity: dto.quantity,
        unitPrice: product.price,
        subtotal,
        notes: dto.notes,
        addedById: userId,
      });

      const newSubtotal = calculateSubtotal([
        ...order.items,
        { unitPrice: product.price, quantity: dto.quantity },
      ]);
      const kitchenStatus = kitchenStatusAfterItemAdded(order.kitchenStatus);
      const kitchenReset = kitchenStatus !== order.kitchenStatus;

      await tx.updateTotals(orderId, {
        subtotal: newSubtotal,
        total: calculateTotal(
          newSubtotal,
          order.discountAmount,
          order.tipAmount,
        ),
        ...(kitchenReset ? { kitchenStatus } : {}),
      });
      await tx.addHistory({
        orderId,
        userId,
        action: 'ITEM_ADDED',
        description: `Agregado ${product.name} x${dto.quantity}`,
        metadata: {
          productId: product.id,
          productName: product.name,
          quantity: dto.quantity,
          unitPrice: Number(product.price),
          subtotal: Number(subtotal),
        },
      });

      return { itemId, product, kitchenReset };
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    const item = order.items.find((i) => i.id === outcome.itemId);
    await this.events.publish({
      type: 'order.item.added',
      order,
      item: {
        id: outcome.itemId,
        productName: outcome.product.name,
        quantity: dto.quantity,
        addedByName: item?.addedByName ?? '',
        unitPrice: Number(outcome.product.price),
      },
      kitchenReset: outcome.kitchenReset,
    });
    return order;
  }
}
