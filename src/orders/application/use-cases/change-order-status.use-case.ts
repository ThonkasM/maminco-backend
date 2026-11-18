import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChangeOrderStatusDto, OrderResponseDto } from '../../dto';
import {
  canTransitionOrder,
  releasesTable,
} from '../../domain/order-status.machine';
import { isFullyPaid } from '../../domain/order-totals';
import { ORDER_REPOSITORY } from '../ports/order.repository';
import type { OrderRepository } from '../ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../ports/order-events.publisher';
import type { OrderEventsPublisher } from '../ports/order-events.publisher';
import { ORDER_RECEIPT_PRINTER } from '../ports/order-receipt.printer';
import type { OrderReceiptPrinter } from '../ports/order-receipt.printer';

@Injectable()
export class ChangeOrderStatusUseCase {
  private readonly logger = new Logger(ChangeOrderStatusUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly events: OrderEventsPublisher,
    @Inject(ORDER_RECEIPT_PRINTER)
    private readonly printer: OrderReceiptPrinter,
  ) {}

  async execute(
    orderId: string,
    dto: ChangeOrderStatusDto,
    userId: string,
  ): Promise<OrderResponseDto> {
    const target = dto.status;

    const tableReleased = await this.orders.transaction(async (tx) => {
      const order = await tx.lockOrder(orderId);
      if (!order) throw new NotFoundException('Orden no encontrada');

      if (!canTransitionOrder(order.status, target)) {
        throw new BadRequestException(
          order.status === 'CLOSED' && target === 'CLOSED'
            ? `La orden #${order.orderNumber} ya está CERRADA. No se puede cerrar dos veces.`
            : `No se puede cambiar de ${order.status} a ${target}`,
        );
      }

      if (target === 'CLOSED') {
        if (order.items.length === 0) {
          throw new BadRequestException(
            'No se puede cerrar una orden sin items',
          );
        }
        if (!isFullyPaid(order.total, order.paidTotal)) {
          throw new ConflictException(
            `La orden #${order.orderNumber} tiene saldo pendiente. Registra los pagos antes de cerrarla.`,
          );
        }
      }

      const changed = await tx.transitionStatus(
        orderId,
        order.status,
        target,
        target === 'CLOSED' ? userId : null,
      );
      if (!changed) {
        throw new ConflictException(
          'La orden fue modificada por otra operación',
        );
      }

      await tx.addHistory({
        orderId,
        userId,
        action: 'STATUS_CHANGED',
        description: `Estado cambiado de ${order.status} a ${target}`,
        metadata: { oldStatus: order.status, newStatus: target },
      });

      return releasesTable(target)
        ? tx.releaseTableIfIdle(order.tableId)
        : false;
    });

    const order = (await this.orders.findView(orderId)) as OrderResponseDto;
    await this.events.publish({
      type: 'order.status.changed',
      order,
      status: target,
      tableReleased,
    });

    if (target === 'CLOSED' && dto.autoPrint) {
      await this.printReceipt(order, dto.printerName);
    }

    return order;
  }

  private async printReceipt(order: OrderResponseDto, printerName?: string) {
    try {
      const result = await this.printer.print(order.id, printerName);
      if (!result.success) {
        this.logger.warn(
          `Error imprimiendo orden #${order.orderNumber}: ${result.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error durante impresión automática de orden #${order.orderNumber}`,
        error as Error,
      );
    }
  }
}
