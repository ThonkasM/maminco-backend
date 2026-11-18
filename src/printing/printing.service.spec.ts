import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrintingService } from './printing.service';
import { PrinterPort } from './domain/printer.port';

describe('PrintingService', () => {
  const listPrinters = jest.fn<Promise<string[]>, []>();
  const getDefaultPrinter = jest.fn<Promise<string | null>, []>();
  const send = jest.fn<Promise<void>, [string, Buffer, string]>();
  const port: PrinterPort = { listPrinters, getDefaultPrinter, send };
  const findUnique = jest.fn();
  const prisma = { order: { findUnique } };
  const service = new PrintingService(prisma as never, port);

  beforeEach(() => {
    jest.resetAllMocks();
    listPrinters.mockResolvedValue(['pos1']);
    getDefaultPrinter.mockResolvedValue('pos1');
  });

  it('sends the test ticket to the default printer', async () => {
    const result = await service.printTest();
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledWith(
      'pos1',
      expect.any(Buffer),
      'ticket-test',
    );
  });

  it('rejects printers not in the whitelist', async () => {
    const result = await service.printTest('evil; rm -rf');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Impresora no válida');
    expect(send).not.toHaveBeenCalled();
    await expect(
      (
        service as never as { resolvePrinter(n: string): Promise<string> }
      ).resolvePrinter('x'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails when no default printer exists', async () => {
    getDefaultPrinter.mockResolvedValue(null);
    await expect(
      (
        service as never as { resolvePrinter(): Promise<string> }
      ).resolvePrinter(),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports missing orders without printing', async () => {
    findUnique.mockResolvedValue(null);
    const result = await service.printOrderFromDatabase('id-1');
    expect(result).toEqual({
      success: false,
      message: 'Orden con ID id-1 no encontrada',
    });
    expect(send).not.toHaveBeenCalled();
  });
});
