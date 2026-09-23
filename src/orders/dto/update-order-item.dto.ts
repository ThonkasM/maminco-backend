import { IsInt, Min, IsOptional, IsString } from 'class-validator';

export class UpdateOrderItemDto {
  @IsInt()
  @Min(1)
  quantity: number; // Nueva cantidad

  @IsString()
  @IsOptional()
  notes?: string; // Notas opcionales
}
