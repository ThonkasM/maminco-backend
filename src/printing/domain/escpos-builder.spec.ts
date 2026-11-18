import { EscPosBuilder } from './escpos-builder';
import { formatDateForPrinter, sanitizeForPrinter } from './text-sanitizer';

describe('EscPosBuilder', () => {
  it('emits the ESC/POS control sequences', () => {
    const bytes = new EscPosBuilder()
      .initialize()
      .align('center')
      .align('right')
      .align('left')
      .bold(true)
      .bold(false)
      .size(2, 1)
      .newline()
      .cut()
      .encode();

    expect([...bytes]).toEqual([
      0x1b, 0x40, 0x1b, 0x61, 1, 0x1b, 0x61, 2, 0x1b, 0x61, 0, 0x1b, 0x45, 1,
      0x1b, 0x45, 0, 0x1d, 0x21, 0x21, 0x0a, 0x1d, 0x56, 0x41, 0x03,
    ]);
  });

  it('sanitizes accents in text', () => {
    const bytes = new EscPosBuilder().text('Descripción Ñandú ¿ok?').encode();
    expect(bytes.toString('utf8')).toBe('Descripcion Nandu ?ok?');
  });
});

describe('text-sanitizer', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeForPrinter('')).toBe('');
  });

  it('formats dates as DD/MM/YYYY HH:MM', () => {
    expect(formatDateForPrinter(new Date(2026, 9, 5, 7, 3))).toBe(
      '05/10/2026 07:03',
    );
  });
});
