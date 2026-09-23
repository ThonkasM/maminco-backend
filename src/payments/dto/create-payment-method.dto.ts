import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO para crear un nuevo método de pago
 *
 * Ejemplos:
 * {
 *   "name": "EFECTIVO",
 *   "code": "CASH",
 *   "description": "Pago en efectivo con monedas y billetes",
 *   "isActive": true
 * }
 *
 * {
 *   "name": "TRANSFERENCIA BANCARIA",
 *   "code": "TRANSFER",
 *   "description": "Transferencia bancaria o QR",
 *   "isActive": true
 * }
 */
export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  name: string; // EFECTIVO, TRANSFERENCIA BANCARIA, TARJETA, etc.

  @IsString()
  @IsNotEmpty()
  code: string; // CASH, TRANSFER, CARD - para programación

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
