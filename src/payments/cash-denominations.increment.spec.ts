import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CashDenominationsService } from './cash-denominations.service';

function setup(found: object | null) {
  const prisma = {
    cashDenomination: {
      findUnique: jest.fn().mockResolvedValue(found),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'd1',
        value: new Prisma.Decimal(10),
        type: 'BILL',
        quantity: data.quantity,
        isActive: true,
      })),
    },
  };
  return {
    prisma,
    service: new CashDenominationsService(prisma as never),
  };
}

describe('CashDenominationsService.incrementQuantity (basis path, V(G)=3)', () => {
  it('C1: rejects a non-positive amount', async () => {
    const { service, prisma } = setup(null);
    await expect(service.incrementQuantity('d1', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.cashDenomination.findUnique).not.toHaveBeenCalled();
  });

  it('C2: rejects an unknown denomination', async () => {
    const { service, prisma } = setup(null);
    await expect(service.incrementQuantity('d1', 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cashDenomination.update).not.toHaveBeenCalled();
  });

  it('C3: adds the amount to the cash quantity', async () => {
    const { service, prisma } = setup({ id: 'd1', quantity: 4 });
    const result = await service.incrementQuantity('d1', 5);
    expect(prisma.cashDenomination.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 9 }),
      }),
    );
    expect(result.quantity).toBe(9);
    expect(result.total).toBe(90);
  });
});
