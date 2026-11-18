import { IsNumber, Min } from 'class-validator';

export class UpdateCashDenominationDto {
  @IsNumber()
  @Min(0)
  quantity: number; // Nueva cantidad en caja
}
