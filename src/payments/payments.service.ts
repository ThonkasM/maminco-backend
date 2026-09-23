import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/money';
import { PaymentsGateway } from './payments.gateway';
import { OrdersGateway } from '../orders/orders.gateway';
import { OrdersService } from '../orders/orders.service';
import {
  ProcessPaymentDto,
  ListPaymentsQueryDto,
  PaymentResponseDto,
  PaginatedPaymentResponseDto,
  PaymentMethodResponseDto,
  PaymentProcessResponseDto,
} from './dto';

@Injectable()
export class PaymentsService {
  private logger: Logger = new Logger('PaymentsService');

  constructor(
    private prisma: PrismaService,
    private paymentsGateway: PaymentsGateway,
    private ordersGateway: OrdersGateway,
    private ordersService: OrdersService,
  ) {}

  /**
   * Obtiene todos los métodos de pago activos
   * Útil para mostrar opciones en el UI
   */
  async getPaymentMethods(): Promise<PaymentMethodResponseDto[]> {
    const methods = await this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return methods.map((method) => ({
      id: method.id,
      name: method.name,
      code: method.code,
      description: method.description || undefined,
      isActive: method.isActive,
      createdAt: method.createdAt,
      updatedAt: method.updatedAt,
    }));
  }

  /**
   * Procesa un pago en una orden
   *
   * Flujo mejorado para MÚLTIPLES PAGOS PARCIALES:
   * 1. Permite pagos parciales (300 + 200 = 500)
   * 2. Cada pago se registra independientemente
   * 3. Solo cierra la orden cuando: totalPagado >= totalDue
   * 4. Calcula saldo pendiente después de cada pago
   * 5. Cuando es último pago: maneja cambio o propina
   *
   * @param orderId - ID de la orden a pagar
   * @param dto - Datos del pago (incluye amountReceived = monto del pago ACTUAL)
   * @param userId - ID del usuario que registra
   * @returns Información del pago procesado
   */
  async processPayment(
    orderId: string,
    dto: ProcessPaymentDto,
    userId: string,
  ): Promise<PaymentProcessResponseDto> {
    // 1. Obtener la orden
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: true,
        createdBy: { select: { name: true } },
        payments: true, // ← IMPORTANTE: Incluir pagos existentes
      },
    });

    if (!order) {
      throw new NotFoundException(`Orden ${orderId} no encontrada`);
    }

    const totalDue = order.total;

    // 2. Validar que la orden no esté ya pagada ni cancelada
    if (order.status === 'CLOSED') {
      return {
        status: 'ERROR',
        message: 'La orden ya está cerrada y pagada',
        error: 'ORDER_ALREADY_CLOSED',
      };
    }

    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'No se puede registrar un pago en una orden cancelada',
      );
    }

    // 3. Obtener método de pago
    const paymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { id: dto.paymentMethodId },
    });

    if (!paymentMethod || !paymentMethod.isActive) {
      throw new BadRequestException('Método de pago inválido o inactivo');
    }

    // 4. Calcular cuánto ya está pagado (Decimal, sin floats)
    const totalPaidAlready = order.payments.reduce(
      (sum, p) => sum.add(p.amountApplied),
      new Prisma.Decimal(0),
    );
    const pendingBalance = money(totalDue.sub(totalPaidAlready));
    const amountReceived = money(dto.amountReceived);

    // 5. Validar que el pago no sea 0 o negativo
    if (amountReceived.lte(0)) {
      return {
        status: 'ERROR',
        message: 'El monto del pago debe ser mayor a 0',
        error: 'INVALID_AMOUNT',
      };
    }

    // 6. Lógica específica por método de pago (se decide por `code`, no por nombre:
    //    los nombres son datos de negocio editables y pueden cambiar)
    const methodCode = paymentMethod.code.toUpperCase();
    let changeAmount: Prisma.Decimal | null = null;
    let tipAmount = new Prisma.Decimal(0);
    let amountApplied = new Prisma.Decimal(0);
    let shouldCloseOrder = false;
    let remainingBalance = new Prisma.Decimal(0);

    // Determinar cuánto aplicar de este pago
    // Si el pago es mayor que lo pendiente, el excedente es cambio/propina
    if (amountReceived.gte(pendingBalance)) {
      // Este es el pago final
      amountApplied = pendingBalance;
      const excess = money(amountReceived.sub(pendingBalance));

      // CASH: El excedente es cambio
      if (methodCode === 'CASH') {
        changeAmount = excess;
        tipAmount = new Prisma.Decimal(0);
      }
      // TRANSFER o CARD: Pregunta si el excedente es propina
      else if (methodCode === 'TRANSFER' || methodCode === 'CARD') {
        if (excess.gt(0) && !dto.isExtraTip) {
          // Pedir confirmación si hay excedente
          return {
            status: 'PENDING_CONFIRMATION',
            message: `Monto mayor al saldo pendiente. ¿La diferencia de $${excess.toFixed(2)} es propina?`,
            difference: Number(excess),
            amountReceived: Number(amountReceived),
            totalDue: Number(pendingBalance),
            pendingBalance: 0,
          };
        }
        // Si está confirmada como propina o no hay excedente
        tipAmount = dto.isExtraTip ? excess : new Prisma.Decimal(0);
        changeAmount = null;
      }

      shouldCloseOrder = true;
      remainingBalance = new Prisma.Decimal(0);
    } else {
      // Pago parcial
      amountApplied = amountReceived;
      changeAmount = null;
      tipAmount = new Prisma.Decimal(0);
      shouldCloseOrder = false;
      remainingBalance = money(pendingBalance.sub(amountApplied));
    }

    const totalPaidNow = money(totalPaidAlready.add(amountApplied));

    // 7. Persistir pago + cierre + auditoría de forma atómica.
    //    El cierre usa updateMany condicionado al estado DRAFT para evitar
    //    dobles cierres por pagos concurrentes.
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          amountReceived,
          amountApplied,
          changeAmount,
          tipAmount,
          order: { connect: { id: orderId } },
          paymentMethod: { connect: { id: dto.paymentMethodId } },
          createdBy: { connect: { id: userId } },
        },
        include: {
          paymentMethod: true,
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      if (shouldCloseOrder) {
        const closeResult = await tx.order.updateMany({
          where: { id: orderId, status: 'DRAFT' },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            closedById: userId,
            ...(tipAmount.gt(0) ? { tipAmount } : {}),
          },
        });

        if (closeResult.count === 0) {
          throw new ConflictException(
            'La orden fue cerrada o modificada por otra operación',
          );
        }

        await tx.table.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
      }

      let auditDescription = `Pago de $${amountApplied.toFixed(2)} por ${paymentMethod.name}`;
      if (shouldCloseOrder) {
        auditDescription += ` (PAGO FINAL)`;
        if (changeAmount)
          auditDescription += ` - Cambio: $${changeAmount.toFixed(2)}`;
        if (tipAmount.gt(0))
          auditDescription += ` - Propina: $${tipAmount.toFixed(2)}`;
      } else {
        auditDescription += ` (PAGO PARCIAL) - Saldo pendiente: $${remainingBalance.toFixed(2)}`;
      }

      await tx.auditLog.create({
        data: {
          action: 'PAYMENT',
          tableName: 'payments',
          recordId: created.id,
          description: auditDescription,
          user: { connect: { id: userId } },
          order: { connect: { id: orderId } },
          newValues: {
            paymentId: created.id,
            amountReceived: Number(amountReceived),
            amountApplied: Number(amountApplied),
            changeAmount: changeAmount ? Number(changeAmount) : null,
            tipAmount: Number(tipAmount),
            method: paymentMethod.name,
          },
        },
      });

      return created;
    });

    this.logger.log(
      `Pago registrado: $${amountApplied.toFixed(2)} - Método: ${paymentMethod.name} - Cambio: ${changeAmount ? changeAmount.toFixed(2) : 'N/A'} - Saldo pendiente: $${remainingBalance.toFixed(2)}`,
    );

    if (shouldCloseOrder) {
      this.logger.log(
        `Orden #${order.orderNumber} cerrada. Total pagado: $${totalPaidNow.toFixed(2)}`,
      );
      await this.emitOrderClosedRealtime(orderId, order.tableId);
    }

    this.paymentsGateway.emitPaymentProcessed(orderId, order.tableId, {
      paymentId: payment.id,
      amount: Number(amountApplied),
      method: paymentMethod.name,
      changeAmount: changeAmount ? Number(changeAmount) : 0,
      tipAmount: Number(tipAmount),
      isPaid: shouldCloseOrder,
      paidBy: order.createdBy.name,
    });

    let message = '';
    if (shouldCloseOrder) {
      message = `Pago final registrado. Orden completamente pagada.`;
      if (changeAmount)
        message += ` Cambio a dar: $${changeAmount.toFixed(2)}.`;
      if (tipAmount.gt(0))
        message += ` Propina registrada: $${tipAmount.toFixed(2)}.`;
    } else {
      message = `Pago parcial registrado: $${amountApplied.toFixed(2)}. Saldo pendiente: $${remainingBalance.toFixed(2)}.`;
    }

    return {
      status: shouldCloseOrder ? 'COMPLETED' : 'PARTIAL_PAYMENT',
      message,
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentId: payment.id,
      amountReceived: Number(amountReceived),
      amountApplied: Number(amountApplied),
      changeAmount: changeAmount ? Number(changeAmount) : null,
      tipAmount: Number(tipAmount),
      totalDue: Number(totalDue),
      paymentMethod: paymentMethod.name,
      orderStatus: shouldCloseOrder ? 'CLOSED' : 'DRAFT',
      totalPaidSoFar: Number(totalPaidNow),
      pendingBalance: Number(remainingBalance),
      isPaid: shouldCloseOrder,
    };
  }

  /**
   * Notifica a las salas de órdenes/mesas que la orden se cerró por pago, para
   * que otras pantallas (POS web/móvil con la orden abierta) dejen de mostrarla
   * como activa y liberen la mesa.
   */
  private async emitOrderClosedRealtime(orderId: string, tableId: string) {
    const [updatedOrder, tablesState] = await Promise.all([
      this.ordersService.findById(orderId).catch(() => null),
      this.ordersService.getAllTablesState().catch(() => []),
    ]);

    this.ordersGateway.emitOrderStatusChanged(orderId, tableId, 'CLOSED');
    if (updatedOrder) {
      this.ordersGateway.emitTableStateUpdated(tableId, updatedOrder);
    }
    this.ordersGateway.emitTableStatusChanged(tableId, 'AVAILABLE', {
      number: updatedOrder?.tableName,
      tableName: updatedOrder?.tableName
        ? `Mesa ${updatedOrder.tableName}`
        : undefined,
      areaId: updatedOrder?.areaId,
    });
    this.ordersGateway.emitAllTablesState(tablesState);
  }

  /**
   * Obtiene el monto total pagado en una orden
   */
  async getTotalPaidAmount(orderId: string): Promise<number> {
    const result = await this.prisma.payment.aggregate({
      where: { orderId },
      _sum: { amountApplied: true },
    });

    return result._sum.amountApplied?.toNumber() || 0;
  }

  /**
   * Obtiene todos los pagos de una orden
   */
  async getPaymentsByOrder(orderId: string): Promise<PaymentResponseDto[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });

    if (!order) {
      throw new NotFoundException(`Orden ${orderId} no encontrada`);
    }

    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      include: {
        paymentMethod: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return payments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      orderNumber: order.orderNumber,
      amountReceived: p.amountReceived.toNumber(),
      amountApplied: p.amountApplied.toNumber(),
      changeAmount: p.changeAmount?.toNumber() || null,
      tipAmount: p.tipAmount.toNumber(),
      paymentMethod: {
        id: p.paymentMethod.id,
        name: p.paymentMethod.name,
      },
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Lista todos los pagos con filtros y paginación
   */
  async findAll(
    query: ListPaymentsQueryDto,
  ): Promise<PaginatedPaymentResponseDto> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    // Construir filtro
    const where: Prisma.PaymentWhereInput = {};

    if (query.orderId) {
      where.orderId = query.orderId;
    }

    if (query.paymentMethodId) {
      where.paymentMethodId = query.paymentMethodId;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const endDate = new Date(query.endDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    // Obtener total y pagos
    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          order: { select: { orderNumber: true } },
          paymentMethod: true,
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const data = payments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      orderNumber: p.order.orderNumber,
      amountReceived: p.amountReceived.toNumber(),
      amountApplied: p.amountApplied.toNumber(),
      changeAmount: p.changeAmount?.toNumber() || null,
      tipAmount: p.tipAmount.toNumber(),
      paymentMethod: {
        id: p.paymentMethod.id,
        name: p.paymentMethod.name,
      },
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    }));

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene un pago por ID
   */
  async findById(paymentId: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: { select: { orderNumber: true } },
        paymentMethod: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Pago ${paymentId} no encontrado`);
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      amountReceived: payment.amountReceived.toNumber(),
      amountApplied: payment.amountApplied.toNumber(),
      changeAmount: payment.changeAmount?.toNumber() || null,
      tipAmount: payment.tipAmount.toNumber(),
      paymentMethod: {
        id: payment.paymentMethod.id,
        name: payment.paymentMethod.name,
      },
      createdBy: payment.createdBy,
      createdAt: payment.createdAt,
    };
  }

  /**
   * Obtiene resumen de pagos por método
   * Útil para reportes y análisis
   */
  async getPaymentSummaryByMethod(
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const where: Prisma.PaymentWhereInput = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const summary = await this.prisma.payment.groupBy({
      by: ['paymentMethodId'],
      where,
      _sum: { amountApplied: true },
      _count: { id: true },
      orderBy: { _sum: { amountApplied: 'desc' } },
    });

    // Obtener nombres de métodos
    const results = await Promise.all(
      summary.map(async (item) => {
        const method = await this.prisma.paymentMethod.findUnique({
          where: { id: item.paymentMethodId },
        });
        const total = item._sum.amountApplied?.toNumber() || 0;
        return {
          method: method?.name || 'Desconocido',
          total,
          count: item._count.id,
          average: total / item._count.id,
        };
      }),
    );

    return results;
  }

  /**
   * Obtiene ingresos totales en un rango de fechas
   */
  async getTotalRevenue(startDate?: Date, endDate?: Date): Promise<number> {
    const where: Prisma.PaymentWhereInput = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const result = await this.prisma.payment.aggregate({
      where,
      _sum: { amountApplied: true },
    });

    return result._sum.amountApplied?.toNumber() || 0;
  }

  /**
   * Obtiene resumen de cambio y propinas
   */
  async getCashSummary(startDate?: Date, endDate?: Date): Promise<any> {
    const where: Prisma.PaymentWhereInput = {
      paymentMethod: { name: { equals: 'EFECTIVO' } },
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const cashPayments = await this.prisma.payment.findMany({
      where,
    });

    const totalCashReceived = cashPayments.reduce(
      (sum, p) => sum + p.amountReceived.toNumber(),
      0,
    );
    const totalCashApplied = cashPayments.reduce(
      (sum, p) => sum + p.amountApplied.toNumber(),
      0,
    );
    const totalChange = cashPayments.reduce(
      (sum, p) => sum + (p.changeAmount?.toNumber() || 0),
      0,
    );

    return {
      totalCashReceived,
      totalCashApplied,
      totalChange,
      expectedInDrawer: totalCashReceived - totalChange,
    };
  }
}
