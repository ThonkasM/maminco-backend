import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderResponseDto } from '../../dto';
import { money } from '../../../common/money';
import { calculateTotal } from '../../domain/order-totals';
import { ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';

@Injectable()
export class AddTipUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
  ) {}

  async execute(
    orderId: string,
    tipAmount: number,
    userId: string,
  ): Promise<OrderResponseDto> {
    if (tipAmount < 0) {
      throw new BadRequestException('La propina no puede ser negativa');
    }

    await this.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new NotFoundException('Orden no encontrada');
      if (order.status !== 'DRAFT') {
        throw new ForbiddenException(
          `No se puede agregar propina a una orden ${order.status}`,
        );
      }

      const tip = money(tipAmount);
      const total = calculateTotal(order.subtotal, order.discountAmount, tip);
      if (total.lt(order.paidTotal)) {
        throw new ConflictException(
          'La propina dejaría el total por debajo de lo ya pagado',
        );
      }

      await tx.updateTotals(orderId, { tipAmount: tip, total });
      await tx.addHistory({
        orderId,
        userId,
        action: 'TIP_ADDED',
        description: `Propina agregada: ${tip.toFixed(2)}`,
        metadata: {
          tipAmount: Number(tip),
          newTotal: Number(total),
          subtotal: Number(order.subtotal),
        },
      });
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    await this.events.publish({ type: 'order.totals.updated', order });
    return order;
  }
}
