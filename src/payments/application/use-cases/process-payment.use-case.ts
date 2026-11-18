import { paymentMethodLabel } from '../../domain/payment-method-label';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentProcessResponseDto, ProcessPaymentDto } from '../../dto';
import { pendingBalance } from '../../../orders/domain/order-totals';
import { allocatePayment } from '../../domain/payment-allocation';
import { PAYMENT_REPOSITORY } from '../ports/payment.repository';
import type {
  PaymentMethodSnapshot,
  PaymentRepository,
} from '../ports/payment.repository';
import { PAYMENT_EVENTS_PUBLISHER } from '../ports/payment-events.publisher';
import type { PaymentEventsPublisher } from '../ports/payment-events.publisher';
import { ORDER_REPOSITORY } from '../../../orders/application/ports/order.repository';
import type { OrderRepository } from '../../../orders/application/ports/order.repository';
import { ORDER_EVENTS_PUBLISHER } from '../../../orders/application/ports/order-events.publisher';
import type { OrderEventsPublisher } from '../../../orders/application/ports/order-events.publisher';

interface Settled {
  response: PaymentProcessResponseDto;
  paymentId?: string;
  tableId?: string;
  closed?: boolean;
  tableReleased?: boolean;
  event?: {
    amount: number;
    method: string;
    changeAmount: number;
    tipAmount: number;
    paidBy: string;
  };
}

const num = (value: Prisma.Decimal | null) => (value ? Number(value) : null);

@Injectable()
export class ProcessPaymentUseCase {
  private readonly logger = new Logger(ProcessPaymentUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PAYMENT_EVENTS_PUBLISHER)
    private readonly paymentEvents: PaymentEventsPublisher,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_EVENTS_PUBLISHER)
    private readonly orderEvents: OrderEventsPublisher,
  ) {}

  async execute(
    orderId: string,
    dto: ProcessPaymentDto,
    userId: string,
  ): Promise<PaymentProcessResponseDto> {
    const method = this.payments.findMethod(dto.paymentMethodId);
    method.catch(() => undefined);

    const settled = await this.payments.transaction((tx) =>
      this.settle(tx, method, orderId, dto, userId),
    );

    if (settled.closed) {
      const order = await this.orders.findView(orderId);
      if (order) {
        await this.orderEvents.publish({
          type: 'order.status.changed',
          order,
          status: 'CLOSED',
          tableReleased: settled.tableReleased ?? false,
        });
      }
    }

    if (settled.event) {
      this.paymentEvents.paymentProcessed({
        orderId,
        tableId: settled.tableId as string,
        paymentId: settled.paymentId as string,
        isPaid: settled.closed ?? false,
        ...settled.event,
      });
    }

    return settled.response;
  }

  private async settle(
    tx: Parameters<Parameters<PaymentRepository['transaction']>[0]>[0],
    methodLookup: Promise<PaymentMethodSnapshot | null>,
    orderId: string,
    dto: ProcessPaymentDto,
    userId: string,
  ): Promise<Settled> {
    const order = await tx.lockOrder(orderId);
    if (!order) throw new NotFoundException(`Orden ${orderId} no encontrada`);

    if (order.status === 'CLOSED') {
      return {
        response: {
          status: 'ERROR',
          message: 'La orden ya está cerrada y pagada',
          error: 'ORDER_ALREADY_CLOSED',
        },
      };
    }
    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'No se puede registrar un pago en una orden cancelada',
      );
    }

    const method = await methodLookup;
    if (!method || !method.isActive) {
      throw new BadRequestException('Método de pago inválido o inactivo');
    }

    const pending = pendingBalance(order.total, order.paidTotal);
    if (pending.lte(0)) {
      throw new ConflictException('La orden no tiene saldo pendiente');
    }

    const allocation = allocatePayment({
      pendingBalance: pending,
      amountReceived: dto.amountReceived,
      methodCode: method.code,
      isExtraTip: dto.isExtraTip,
    });

    if (allocation.kind === 'INVALID_AMOUNT') {
      return {
        response: {
          status: 'ERROR',
          message: 'El monto del pago debe ser mayor a 0',
          error: 'INVALID_AMOUNT',
        },
      };
    }
    if (allocation.kind === 'NEEDS_TIP_CONFIRMATION') {
      return {
        response: {
          status: 'PENDING_CONFIRMATION',
          message: `Monto mayor al saldo pendiente. ¿La diferencia de $${allocation.difference.toFixed(2)} es propina?`,
          difference: Number(allocation.difference),
          amountReceived: Number(allocation.amountReceived),
          totalDue: Number(pending),
          pendingBalance: 0,
        },
      };
    }
    if (allocation.kind === 'NO_PENDING_BALANCE') {
      throw new ConflictException('La orden no tiene saldo pendiente');
    }

    const { amountReceived, amountApplied, changeAmount, tipAmount } =
      allocation;
    const closes = allocation.closesOrder;

    const paymentId = await tx.recordPayment({
      orderId,
      paymentMethodId: method.id,
      createdById: userId,
      amountReceived,
      amountApplied,
      changeAmount,
      tipAmount,
      auditDescription: this.auditDescription(method.name, allocation),
      auditValues: {
        amountReceived: Number(amountReceived),
        amountApplied: Number(amountApplied),
        changeAmount: num(changeAmount),
        tipAmount: Number(tipAmount),
        method: method.name,
      },
    });

    let tableReleased = false;
    if (closes) {
      if (!(await tx.closeOrder(orderId, userId, tipAmount))) {
        throw new ConflictException(
          'La orden fue cerrada o modificada por otra operación',
        );
      }
      tableReleased = await tx.releaseTableIfIdle(order.tableId);
    }

    const totalPaidNow = order.paidTotal.add(amountApplied);
    this.logger.log(
      `Pago registrado: $${amountApplied.toFixed(2)} - Método: ${method.name} - Orden #${order.orderNumber}${closes ? ' (cerrada)' : ''}`,
    );

    return {
      paymentId,
      tableId: order.tableId,
      closed: closes,
      tableReleased,
      event: {
        amount: Number(amountApplied),
        method: method.name,
        changeAmount: Number(changeAmount ?? 0),
        tipAmount: Number(tipAmount),
        paidBy: order.createdByName,
      },
      response: {
        status: closes ? 'COMPLETED' : 'PARTIAL_PAYMENT',
        message: this.message(allocation),
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId,
        amountReceived: Number(amountReceived),
        amountApplied: Number(amountApplied),
        changeAmount: num(changeAmount),
        tipAmount: Number(tipAmount),
        totalDue: Number(order.total),
        paymentMethod: paymentMethodLabel(method.code, method.name),
        orderStatus: closes ? 'CLOSED' : 'DRAFT',
        totalPaidSoFar: Number(totalPaidNow),
        pendingBalance: Number(allocation.remainingBalance),
        isPaid: closes,
      },
    };
  }

  private auditDescription(
    methodName: string,
    a: {
      amountApplied: Prisma.Decimal;
      changeAmount: Prisma.Decimal | null;
      tipAmount: Prisma.Decimal;
      remainingBalance: Prisma.Decimal;
      closesOrder: boolean;
    },
  ): string {
    let text = `Pago de $${a.amountApplied.toFixed(2)} por ${methodName}`;
    if (!a.closesOrder) {
      return `${text} (PAGO PARCIAL) - Saldo pendiente: $${a.remainingBalance.toFixed(2)}`;
    }
    text += ' (PAGO FINAL)';
    if (a.changeAmount) text += ` - Cambio: $${a.changeAmount.toFixed(2)}`;
    if (a.tipAmount.gt(0)) text += ` - Propina: $${a.tipAmount.toFixed(2)}`;
    return text;
  }

  private message(a: {
    amountApplied: Prisma.Decimal;
    changeAmount: Prisma.Decimal | null;
    tipAmount: Prisma.Decimal;
    remainingBalance: Prisma.Decimal;
    closesOrder: boolean;
  }): string {
    if (!a.closesOrder) {
      return `Pago parcial registrado: $${a.amountApplied.toFixed(2)}. Saldo pendiente: $${a.remainingBalance.toFixed(2)}.`;
    }
    let text = 'Pago final registrado. Orden completamente pagada.';
    if (a.changeAmount) text += ` Cambio a dar: $${a.changeAmount.toFixed(2)}.`;
    if (a.tipAmount.gt(0)) {
      text += ` Propina registrada: $${a.tipAmount.toFixed(2)}.`;
    }
    return text;
  }
}
