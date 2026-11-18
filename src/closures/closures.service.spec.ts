import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { ReportsService } from '../reports/reports.service';
import type { RepositoryService } from '../repository/repository.service';
import { ClosuresService } from './closures.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../repository/repository.service', () => ({
  RepositoryService: class {},
}));

const actor = { id: 'u1', name: 'Admin', role: 'ADMINISTRATOR' } as AuthUser;
const summary = {
  from: '2026-11-16',
  to: '2026-11-16',
  totalSales: 500,
  totalOrders: 4,
  averageOrderValue: 125,
  totalDiscount: 0,
  totalTips: 0,
  tableOrders: 4,
  virtualOrders: 0,
  totalItems: 9,
  averageItemsPerOrder: 2.25,
};

function build(
  options: {
    open?: number;
    existing?: { id: string; regeneratedCount: number } | null;
  } = {},
) {
  const create = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'c1',
        regeneratedCount: 0,
        closedAt: new Date(),
        ...data,
      }),
    );
  const update = jest
    .fn()
    .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'c1',
        closedAt: new Date(),
        businessDate: '2026-11-16',
        ...data,
      }),
    );
  const prisma = {
    order: { count: jest.fn().mockResolvedValue(options.open ?? 0) },
    dayClosure: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(options.existing ?? null),
      create,
      update,
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: {
          amountReceived: null,
          amountApplied: null,
          changeAmount: null,
          tipAmount: null,
        },
      }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Admin' }) },
  };
  const reports = {
    businessToday: jest.fn().mockResolvedValue('2026-11-17'),
    businessDayBounds: jest.fn().mockResolvedValue({
      start: new Date('2026-11-16T04:00:00Z'),
      end: new Date('2026-11-17T04:00:00Z'),
    }),
    getSummary: jest.fn().mockResolvedValue(summary),
    getBreakdown: jest.fn().mockResolvedValue([]),
    getTopProducts: jest.fn().mockResolvedValue([]),
  };
  const saveSystemFile = jest.fn().mockResolvedValue({ id: 'doc1' });
  const service = new ClosuresService(
    prisma as unknown as PrismaService,
    reports as unknown as ReportsService,
    { saveSystemFile } as unknown as RepositoryService,
  );
  return { service, prisma, reports, saveSystemFile, create, update };
}

describe('ClosuresService.run', () => {
  it('rejects a day that has not finished unless acknowledged', async () => {
    const { service } = build();
    await expect(
      service.run({ date: '2026-11-17' }, actor),
    ).rejects.toMatchObject({
      response: { code: 'DAY_NOT_FINISHED' },
    });
  });

  it('rejects future days', async () => {
    const { service } = build();
    await expect(
      service.run({ date: '2026-11-18' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('asks for confirmation when orders are still open', async () => {
    const { service } = build({ open: 2 });
    const error = await service
      .run({ date: '2026-11-16' }, actor)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'OPEN_ORDERS',
      openOrders: 2,
    });
  });

  it('stores the PDF under Cierres de caja/year/month and records the closure', async () => {
    const { service, saveSystemFile, create } = build();
    const closure = await service.run({ date: '2026-11-16' }, actor);
    const [input] = saveSystemFile.mock.calls[0] as [
      { folderPath: string[]; name: string; mimeType: string; buffer: Buffer },
    ];
    expect(input.folderPath).toEqual(['Cierres de caja', '2026', '11']);
    expect(input.name).toBe('2026-11-16 Cierre de caja.pdf');
    expect(input.mimeType).toBe('application/pdf');
    expect(input.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(create).toHaveBeenCalled();
    expect(closure).toMatchObject({
      documentId: 'doc1',
      early: false,
      totalSales: 500,
    });
  });

  it('flags early closures and counts regenerations', async () => {
    const { service, update } = build({
      existing: { id: 'c1', regeneratedCount: 1 },
    });
    const closure = await service.run(
      { date: '2026-11-17', acknowledgeEarly: true },
      actor,
    );
    expect(closure.early).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ regeneratedCount: 2 }),
      }),
    );
  });
});

describe('ClosuresService.status', () => {
  it('lists unclosed past days that have activity', async () => {
    const { service, reports } = build();
    reports.getSummary.mockImplementation(({ from }: { from: string }) =>
      Promise.resolve({
        ...summary,
        totalOrders: from === '2026-11-15' ? 3 : 0,
      }),
    );
    const status = await service.status();
    expect(status.currentBusinessDate).toBe('2026-11-17');
    expect(status.pending).toEqual(['2026-11-15']);
  });
});
