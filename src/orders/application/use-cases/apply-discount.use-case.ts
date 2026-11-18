import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplyDiscountDto, OrderResponseDto } from '../../dto';
import { calculateDiscount, calculateTotal } from '../../domain/order-totals';
import { assertEditable } from '../order-guards';
import { ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';

const DISCOUNT_ERRORS = {
  MISSING: 'Se debe proporcionar un descuento porcentual o fijo',
  BOTH: 'No se puede aplicar ambos tipos de descuento simultáneamente',
  PERCENT_RANGE: 'El descuento porcentual debe estar entre 0 y 100',
  NEGATIVE: 'El descuento fijo no puede ser negativo',
  EXCEEDS: 'El descuento no puede ser mayor al subtotal',
} as const;

@Injectable()
export class ApplyDiscountUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
  ) {}

  async execute(
    orderId: string,
    dto: ApplyDiscountDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    await this.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new NotFoundException('Orden no encontrada');
      assertEditable(order, 'aplicar descuentos a');

      const discount = calculateDiscount(order.subtotal, {
        percentage: dto.percentageDiscount,
        fixed: dto.fixedDiscount,
      });
      if (!discount.ok) {
        throw new BadRequestException(DISCOUNT_ERRORS[discount.reason]);
      }

      const total = calculateTotal(
        order.subtotal,
        discount.amount,
        order.tipAmount,
      );
      await tx.updateTotals(orderId, {
        discountAmount: discount.amount,
        total,
      });
      await tx.addHistory({
        orderId,
        userId,
        action: 'DISCOUNT_APPLIED',
        description: `Descuento aplicado: ${discount.amount.toFixed(2)} - ${dto.reason || 'Sin razón'}`,
        metadata: {
          discountAmount: Number(discount.amount),
          discountType: discount.type,
          reason: dto.reason || 'Sin descripción',
          appliedTo: Number(order.subtotal),
          newTotal: Number(total),
        },
      });
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    await this.events.publish({ type: 'order.totals.updated', order });
    return order;
  }
}
