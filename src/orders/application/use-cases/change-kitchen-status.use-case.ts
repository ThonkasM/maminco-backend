import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderResponseDto, UpdateKitchenStatusDto } from '../../dto';
import { canTransitionKitchen } from '../../domain/kitchen-status.machine';
import { ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';

@Injectable()
export class ChangeKitchenStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
  ) {}

  async execute(
    orderId: string,
    dto: UpdateKitchenStatusDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    const target = dto.status;

    const changed = await this.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new NotFoundException('Orden no encontrada');
      if (order.status !== 'DRAFT') {
        throw new BadRequestException(
          `No se puede cambiar el estado de cocina de una orden ${order.status}`,
        );
      }
      if (order.kitchenStatus === target) return false;
      if (!canTransitionKitchen(order.kitchenStatus, target)) {
        throw new BadRequestException(
          `No se puede cambiar el estado de cocina de ${order.kitchenStatus} a ${target}`,
        );
      }

      await tx.setKitchenStatus(orderId, target);
      await tx.addHistory({
        orderId,
        userId,
        action: 'KITCHEN_STATUS_CHANGED',
        description: `Cocina: ${order.kitchenStatus} → ${target}`,
        metadata: { from: order.kitchenStatus, to: target },
      });
      return true;
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    if (changed) {
      await this.events.publish({
        type: 'order.kitchen-status.changed',
        order,
        kitchenStatus: target,
      });
    }
    return order;
  }
}
