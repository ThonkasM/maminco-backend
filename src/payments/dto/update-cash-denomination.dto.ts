import { IsNumber, IsString, IsNotEmpty, Min } from 'class-validator';

/**
 * DTO para actualizar cantidad de denominación en caja
 *
 * Ejemplo:
 * {
 *   "quantity": 15  // Actualizar a 15 billetes de Bs 100
 * }
 */
export class UpdateCashDenominationDto {
  @IsNumber()
  @Min(0)
  quantity: number; // Nueva cantidad en caja
}
