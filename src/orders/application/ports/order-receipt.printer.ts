export const ORDER_RECEIPT_PRINTER = Symbol('ORDER_RECEIPT_PRINTER');

export interface OrderReceiptPrinter {
  print(
    orderId: string,
    printerName?: string,
  ): Promise<{ success: boolean; message?: string }>;
}
