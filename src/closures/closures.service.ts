import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { DayClosure, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from '../reports/report-range';
import { ReportsService } from '../reports/reports.service';
import { RepositoryService } from '../repository/repository.service';
import { buildClosurePdf, type ClosurePdfData } from './pdf/closure-pdf';

const LOOKBACK_DAYS = 7;
export const CLOSURES_FOLDER = 'Cierres de caja';

export interface ClosureDto {
  id: string;
  businessDate: string;
  early: boolean;
  regeneratedCount: number;
  totalSales: number;
  totalOrders: number;
  documentId: string | null;
  closedAt: Date;
}

const toDto = (closure: DayClosure): ClosureDto => ({
  id: closure.id,
  businessDate: closure.businessDate,
  early: closure.early,
  regeneratedCount: closure.regeneratedCount,
  totalSales: Number(closure.totalSales),
  totalOrders: closure.totalOrders,
  documentId: closure.documentId,
  closedAt: closure.closedAt,
});

@Injectable()
export class ClosuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly repository: RepositoryService,
  ) {}

  private async openOrdersOn(date: string): Promise<number> {
    const { start, end } = await this.reports.businessDayBounds(date);
    return this.prisma.order.count({
      where: {
        status: 'DRAFT',
        deletedAt: null,
        createdAt: { gte: start, lt: end },
      },
    });
  }

  async status() {
    const currentBusinessDate = await this.reports.businessToday();
    const last = await this.prisma.dayClosure.findFirst({
      orderBy: { businessDate: 'desc' },
    });
    const floor = addDays(currentBusinessDate, -LOOKBACK_DAYS);
    const first =
      last && addDays(last.businessDate, 1) > floor
        ? addDays(last.businessDate, 1)
        : floor;

    const pending: string[] = [];
    for (
      let date = first;
      date < currentBusinessDate;
      date = addDays(date, 1)
    ) {
      const closed = await this.prisma.dayClosure.findUnique({
        where: { businessDate: date },
      });
      if (closed) continue;
      const [summary, open] = await Promise.all([
        this.reports.getSummary({ from: date, to: date }),
        this.openOrdersOn(date),
      ]);
      if (summary.totalOrders > 0 || open > 0) pending.push(date);
    }
    return {
      currentBusinessDate,
      pending,
      lastClosure: last ? toDto(last) : null,
    };
  }

  async list(limit = 30) {
    const rows = await this.prisma.dayClosure.findMany({
      orderBy: { businessDate: 'desc' },
      take: limit,
    });
    return rows.map(toDto);
  }

  async run(
    input: {
      date: string;
      acknowledgeEarly?: boolean;
      acknowledgeOpenOrders?: boolean;
    },
    actor: AuthUser,
  ): Promise<ClosureDto> {
    const { date } = input;
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new BadRequestException('Fecha inválida.');
    }
    const current = await this.reports.businessToday();
    if (date > current) {
      throw new BadRequestException('No se puede cerrar un día futuro.');
    }
    const early = date >= current;
    if (early && !input.acknowledgeEarly) {
      throw new ConflictException({
        code: 'DAY_NOT_FINISHED',
        message: `El día de negocio ${date} aún no terminó. Un cierre anticipado no incluirá las ventas posteriores.`,
      });
    }
    const openOrders = await this.openOrdersOn(date);
    if (openOrders > 0 && !input.acknowledgeOpenOrders) {
      throw new ConflictException({
        code: 'OPEN_ORDERS',
        openOrders,
        message: `Hay ${openOrders} orden${openOrders === 1 ? '' : 'es'} abierta${openOrders === 1 ? '' : 's'} de ese día que no entrará${openOrders === 1 ? '' : 'n'} en el cierre.`,
      });
    }

    const range = { from: date, to: date };
    const bounds = await this.reports.businessDayBounds(date);
    const [summary, payments, shifts, topProducts, cash, user] =
      await Promise.all([
        this.reports.getSummary(range),
        this.reports.getBreakdown({ ...range, by: 'paymentMethod', limit: 20 }),
        this.reports.getBreakdown({ ...range, by: 'shift' }),
        this.reports.getTopProducts({ ...range, limit: 10 }),
        this.prisma.payment.aggregate({
          _sum: {
            amountReceived: true,
            amountApplied: true,
            changeAmount: true,
            tipAmount: true,
          },
          where: {
            paymentMethod: { code: 'CASH' },
            order: {
              status: 'CLOSED',
              closedAt: { gte: bounds.start, lt: bounds.end },
            },
          },
        }),
        this.prisma.user.findUnique({
          where: { id: actor.id },
          select: { name: true },
        }),
      ]);

    const num = (value: Prisma.Decimal | null) =>
      value ? value.toNumber() : 0;
    const data: ClosurePdfData = {
      businessDate: date,
      generatedAt: new Date(),
      closedBy: user?.name ?? actor.name ?? 'Sistema',
      early,
      openOrders,
      summary,
      payments,
      shifts,
      topProducts,
      cash: {
        received: num(cash._sum.amountReceived),
        applied: num(cash._sum.amountApplied),
        change: num(cash._sum.changeAmount),
        tips: num(cash._sum.tipAmount),
      },
    };
    const pdf = await buildClosurePdf(data);
    const saved = await this.repository.saveSystemFile({
      folderPath: [CLOSURES_FOLDER, date.slice(0, 4), date.slice(5, 7)],
      name: `${date} Cierre de caja.pdf`,
      buffer: pdf,
      mimeType: 'application/pdf',
      createdById: actor.id,
    });

    const existing = await this.prisma.dayClosure.findUnique({
      where: { businessDate: date },
    });
    const values = {
      early,
      totalSales: summary.totalSales,
      totalOrders: summary.totalOrders,
      summary: {
        ...summary,
        payments,
        shifts,
        openOrders,
      } as unknown as Prisma.InputJsonValue,
      documentId: saved.id,
      closedAt: new Date(),
      closedById: actor.id,
    };
    const closure = existing
      ? await this.prisma.dayClosure.update({
          where: { id: existing.id },
          data: { ...values, regeneratedCount: existing.regeneratedCount + 1 },
        })
      : await this.prisma.dayClosure.create({
          data: { businessDate: date, ...values },
        });
    return toDto(closure);
  }
}
