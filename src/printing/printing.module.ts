import { Module } from '@nestjs/common';
import { PrintingService } from './printing.service';
import { PrintingController } from './printing.controller';
import { PRINTER_PORT } from './domain/printer.port';
import { CupsPrinterAdapter } from './infrastructure/cups-printer.adapter';

@Module({
  controllers: [PrintingController],
  providers: [
    PrintingService,
    { provide: PRINTER_PORT, useClass: CupsPrinterAdapter },
  ],
  exports: [PrintingService],
})
export class PrintingModule {}
