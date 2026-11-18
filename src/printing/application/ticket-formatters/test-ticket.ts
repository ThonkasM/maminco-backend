import { EscPosBuilder } from '../../domain/escpos-builder';
import { formatDateForPrinter } from '../../domain/text-sanitizer';
import { SEPARATOR } from './shared';

export function formatTestTicket(now: Date): Buffer {
  return new EscPosBuilder()
    .initialize()
    .newline()
    .align('center')
    .bold(true)
    .text('PRUEBA')
    .bold(false)
    .newline()
    .text(SEPARATOR)
    .newline()
    .text('Restaurante Maminco')
    .newline()
    .text(SEPARATOR)
    .newline()
    .newline()
    .align('left')
    .text('Esta es una prueba de impresion')
    .newline()
    .text(`Fecha: ${formatDateForPrinter(now)}`)
    .newline()
    .newline()
    .align('center')
    .text('Prueba completada exitosamente')
    .newline()
    .newline()
    .newline()
    .cut()
    .encode();
}
