import {
  IsString,
  IsNumber,
  Min,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';

/**
 * DTO para procesar un pago en una orden
 *
 * Flujo:
 * 1. El cajero selecciona el método de pago (EFECTIVO, TRANSFERENCIA, TARJETA)
 * 2. Ingresa el monto que el cliente paga (amountReceived)
 * 3. El sistema valida y calcula automáticamente:
 *    - EFECTIVO: calcula el cambio
 *    - TRANSFERENCIA/TARJETA: si hay diferencia, pregunta si es propina
 *
 * Ejemplos:
 *
 * EFECTIVO: Cliente paga $250, cuenta es $245
 * {
 *   "paymentMethodId": "efectivo",
 *   "amountReceived": 250.00
 * }
 * Respuesta: Cambio a dar $5.00
 *
 * TRANSFERENCIA: Cliente transfiere $245 exacto
 * {
 *   "paymentMethodId": "transferencia",
 *   "amountReceived": 245.00
 * }
 * Respuesta: Pago completado
 *
 * TARJETA: Cliente paga $255 (propina incluida)
 * {
 *   "paymentMethodId": "tarjeta",
 *   "amountReceived": 255.00,
 *   "isExtraTip": true
 * }
 * Respuesta: Pago completado, propina de $10 registrada
 */
export class ProcessPaymentDto {
  /**
   * ID del método de pago (EFECTIVO, TRANSFERENCIA, TARJETA)
   */
  @IsString()
  @IsNotEmpty({ message: 'El método de pago es requerido' })
  paymentMethodId: string;

  /**
   * Monto que el cliente realmente paga
   * Puede ser mayor al total (para efectivo con cambio o propina)
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  @IsNotEmpty({ message: 'El monto recibido es requerido' })
  amountReceived: number;

  /**
   * Confirmación de que la diferencia es propina (para TRANSFERENCIA/TARJETA)
   * Solo se usa cuando amountReceived > totalDue
   *
   * Ejemplo:
   * - Cuenta: $245
   * - Monto recibido: $255
   * - Diferencia: $10
   * - isExtraTip: true → Se registra como propina
   */
  @IsOptional()
  @IsBoolean()
  isExtraTip?: boolean;

  /**
   * Notas adicionales (opcional)
   */
  @IsOptional()
  @IsString()
  notes?: string;
}
