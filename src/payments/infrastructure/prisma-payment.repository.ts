import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { releaseTableIfIdle } from '../../orders/infrastructure/order-locks';
import {
  NewPayment,
  PayableOrder,
  PaymentMethodSnapshot,
  PaymentRepository,
  PaymentTransaction,
} from '../application/ports/payment.repository';

interface LockedOrderRow {
  id: string;
  orderNumber: string;
  status: PayableOrder['status'];
  tableId: string;
  total: string;
  paidTotal: string;
  createdByName: string;
}

class PrismaPaymentTransaction implements PaymentTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async lockOrder(orderId: string): Promise<PayableOrder | null> {
    const rows = await this.tx.$queryRaw<LockedOrderRow[]>`
      SELECT o."id",
             o."orderNumber",
             o."status"::text AS "status",
             o."tableId",
             o."total"::text AS "total",
             COALESCE(
               (SELECT SUM(p."amountApplied") FROM "payments" p WHERE p."orderId" = o."id"),
               0
             )::text AS "paidTotal",
             u."name" AS "createdByName"
      FROM "orders" o
      JOIN "users" u ON u."id" = o."createdById"
      WHERE o."id" = ${orderId}
      FOR UPDATE OF o`;
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      tableId: row.tableId,
      total: new Prisma.Decimal(row.total),
      paidTotal: new Prisma.Decimal(row.paidTotal),
      createdByName: row.createdByName,
    };
  }

  async recordPayment(payment: NewPayment): Promise<string> {
    const created = await this.tx.payment.create({
      data: {
        amountReceived: payment.amountReceived,
        amountApplied: payment.amountApplied,
        changeAmount: payment.changeAmount,
        tipAmount: payment.tipAmount,
        order: { connect: { id: payment.orderId } },
        paymentMethod: { connect: { id: payment.paymentMethodId } },
        createdBy: { connect: { id: payment.createdById } },
      },
      select: { id: true },
    });

    await this.tx.auditLog.create({
      data: {
        action: 'PAYMENT',
        tableName: 'payments',
        recordId: created.id,
        description: payment.auditDescription,
        user: { connect: { id: payment.createdById } },
        order: { connect: { id: payment.orderId } },
        newValues: { paymentId: created.id, ...payment.auditValues },
      },
    });

    return created.id;
  }

  async closeOrder(
    orderId: string,
    closedById: string,
    tipAmount: Prisma.Decimal,
  ): Promise<boolean> {
    const result = await this.tx.order.updateMany({
      where: { id: orderId, status: 'DRAFT' },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById,
        ...(tipAmount.gt(0) ? { tipAmount } : {}),
      },
    });
    return result.count === 1;
  }

  releaseTableIfIdle(tableId: string): Promise<boolean> {
    return releaseTableIfIdle(this.tx, tableId);
  }
}

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMethod(methodId: string): Promise<PaymentMethodSnapshot | null> {
    return this.prisma.paymentMethod.findUnique({
      where: { id: methodId },
      select: { id: true, name: true, code: true, isActive: true },
    });
  }

  transaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) =>
      work(new PrismaPaymentTransaction(tx)),
    );
  }
}
