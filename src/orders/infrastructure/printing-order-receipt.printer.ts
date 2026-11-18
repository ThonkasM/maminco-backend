import { Injectable } from '@nestjs/common';
import { PrintingService } from '../../printing/printing.service';
import { OrderReceiptPrinter } from '../application/ports/order-receipt.printer';

@Injectable()
export class PrintingOrderReceiptPrinter implements OrderReceiptPrinter {
  constructor(private readonly printing: PrintingService) {}

  print(orderId: string, printerName?: string) {
    return this.printing.printOrderFromDatabase(orderId, printerName);
  }
}
