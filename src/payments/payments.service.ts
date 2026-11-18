import { paymentMethodLabel } from './domain/payment-method-label';
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListPaymentsQueryDto,
  PaymentResponseDto,
  PaginatedPaymentResponseDto,
  PaymentMethodResponseDto,
} from './dto';

@Injectable()
export class PaymentsService {
  private logger: Logger = new Logger('PaymentsService');

  constructor(private prisma: PrismaService) {}

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

  async getTotalPaidAmount(orderId: string): Promise<number> {
    const result = await this.prisma.payment.aggregate({
      where: { orderId },
      _sum: { amountApplied: true },
    });

    return result._sum.amountApplied?.toNumber() || 0;
  }

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
        name: paymentMethodLabel(p.paymentMethod.code, p.paymentMethod.name),
      },
      createdBy: p.createdBy,
      createdAt: p.createdAt,
    }));
  }

  async findAll(
    query: ListPaymentsQueryDto,
  ): Promise<PaginatedPaymentResponseDto> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
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
        name: paymentMethodLabel(p.paymentMethod.code, p.paymentMethod.name),
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
        name: paymentMethodLabel(
          payment.paymentMethod.code,
          payment.paymentMethod.name,
        ),
      },
      createdBy: payment.createdBy,
      createdAt: payment.createdAt,
    };
  }

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

  async getCashSummary(startDate?: Date, endDate?: Date): Promise<any> {
    const where: Prisma.PaymentWhereInput = {
      paymentMethod: { code: 'CASH' },
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
