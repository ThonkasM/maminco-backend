export const PRINTER_PORT = Symbol('PRINTER_PORT');

export interface PrinterPort {
  listPrinters(): Promise<string[]>;
  getDefaultPrinter(): Promise<string | null>;
  send(printer: string, data: Buffer, jobPrefix: string): Promise<void>;
}
