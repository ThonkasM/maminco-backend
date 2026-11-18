import { sanitizeForPrinter } from './text-sanitizer';

export type Alignment = 'left' | 'center' | 'right';

export class EscPosBuilder {
  private readonly chunks: Buffer[] = [];

  initialize(): this {
    this.chunks.push(Buffer.from([0x1b, 0x40]));
    return this;
  }

  align(alignment: Alignment): this {
    const code = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.chunks.push(Buffer.from([0x1b, 0x61, code]));
    return this;
  }

  bold(enable: boolean): this {
    this.chunks.push(Buffer.from([0x1b, 0x45, enable ? 1 : 0]));
    return this;
  }

  size(width: number, height: number): this {
    const code = ((width & 0xf) << 4) | (height & 0xf);
    this.chunks.push(Buffer.from([0x1d, 0x21, code]));
    return this;
  }

  text(value: string): this {
    this.chunks.push(Buffer.from(sanitizeForPrinter(value), 'utf8'));
    return this;
  }

  newline(): this {
    this.chunks.push(Buffer.from('\n'));
    return this;
  }

  cut(): this {
    this.chunks.push(Buffer.from([0x1d, 0x56, 0x41, 0x03]));
    return this;
  }

  encode(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
