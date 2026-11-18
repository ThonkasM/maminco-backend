import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { PrinterPort } from '../domain/printer.port';

const execFileAsync = promisify(execFile);

@Injectable()
export class CupsPrinterAdapter implements PrinterPort {
  private readonly logger = new Logger(CupsPrinterAdapter.name);

  async listPrinters(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('lpstat', ['-p', '-d']);
      return stdout
        .split('\n')
        .filter((line) => line.includes('printer'))
        .map((line) => line.match(/printer\s+(\S+)/)?.[1] ?? null)
        .filter((printer): printer is string => printer !== null);
    } catch (error) {
      this.logger.error('Error listando impresoras:', error);
      return [];
    }
  }

  async getDefaultPrinter(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('lpstat', ['-d']);
      return stdout.match(/device\s+for\s+(\S+)/)?.[1] ?? null;
    } catch (error) {
      this.logger.error('Error obteniendo impresora por defecto:', error);
      return null;
    }
  }

  async send(printer: string, data: Buffer, jobPrefix: string): Promise<void> {
    const file = path.join(os.tmpdir(), `${jobPrefix}-${randomUUID()}.bin`);
    await fs.writeFile(file, data);
    try {
      await execFileAsync('lp', ['-d', printer, '-o', 'raw', file]);
    } finally {
      fs.unlink(file).catch(() => undefined);
    }
  }
}
