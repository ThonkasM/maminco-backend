/**
 * DTO para imprimir una orden completa en una impresora térmica ESC/POS
 */
export class PrintOrderDto {
  /**
   * ID de la orden a imprimir
   */
  orderId: string;

  /**
   * Nombre de la impresora (opcional)
   * Si no se proporciona, se usa la impresora por defecto del sistema
   */
  printerName?: string;

  /**
   * Si es true, intenta imprimir después de cerrar la orden
   * Si es false, solo cierra sin imprimir
   * Default: true
   */
  autoPrint?: boolean;
}
