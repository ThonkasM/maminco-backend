import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsString,
} from 'class-validator';

export class ApplyDiscountDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  percentageDiscount?: number; // Descuento en porcentaje (0-100%)

  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'fixedDiscount must be a number with at most 2 decimals' },
  )
  @Min(0)
  fixedDiscount?: number; // Descuento fijo en monto (Bs., 2 decimales)

  @IsString()
  @IsOptional()
  reason?: string; // Razón del descuento (ej: "Cortesía", "Promoción", etc.)
}
