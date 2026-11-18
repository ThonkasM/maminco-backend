import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateOrderDto, OrderResponseDto } from '../../dto';
import { formatOrderNumber, lineSubtotal } from '../../domain/order-totals';
import { sumMoney } from '../../../common/money';
import { NewOrderLine, ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
  ) {}

  async execute(
    dto: CreateOrderDto,
    actorId?: string,
  ): Promise<OrderResponseDto> {
    const createdById = actorId ?? dto.createdById;
    if (!createdById) {
      throw new BadRequestException('Usuario creador requerido');
    }

    const table = await this.orders.findTable(dto.tableId);
    if (!table || table.deletedAt) {
      throw new NotFoundException('Mesa no encontrada');
    }
    if (!table.areaName) {
      throw new NotFoundException('Mesa no tiene área asignada');
    }

    const creator = await this.orders.findUser(createdById);
    if (!creator || creator.deletedAt) {
      throw new NotFoundException('Usuario creador no encontrado');
    }

    const attendedById = dto.attendedById ?? createdById;
    if (dto.attendedById) {
      const attendant = await this.orders.findUser(dto.attendedById);
      if (!attendant || attendant.deletedAt) {
        throw new NotFoundException('Usuario asistente no encontrado');
      }
    }

    const requested = dto.initialItems ?? [];
    const orderId = await this.orders.transaction(async (tx) => {
      const productIds = [...new Set(requested.map((i) => i.productId))];
      const products = productIds.length
        ? await tx.findProducts(productIds)
        : [];
      const productById = new Map(products.map((p) => [p.id, p]));

      const lines: NewOrderLine[] = requested.map((item) => {
        const product = productById.get(item.productId);
        if (!product || product.deletedAt) {
          throw new NotFoundException(
            `Producto no encontrado: ${item.productId}`,
          );
        }
        if (!product.isAvailable) {
          throw new BadRequestException(
            `Producto no disponible: ${product.name}`,
          );
        }
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(product.price),
          subtotal: lineSubtotal(product.price, item.quantity),
          notes: item.notes,
          addedById: createdById,
        };
      });

      await tx.lockTable(dto.tableId);
      if (await tx.hasOpenOrder(dto.tableId)) {
        throw new ConflictException('La mesa ya tiene una orden abierta');
      }

      const id = await tx.insertOrder({
        orderNumber: formatOrderNumber(await tx.nextOrderNumber()),
        tableId: dto.tableId,
        serviceType: table.areaName as string,
        createdById,
        attendedById,
        subtotal: sumMoney(lines.map((l) => l.subtotal)),
        lines,
        historyDescription: `Orden creada por ${creator.name}`,
      });
      await tx.occupyTable(dto.tableId);
      return id;
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    await this.events.publish({ type: 'order.created', order });
    return order;
  }
}
