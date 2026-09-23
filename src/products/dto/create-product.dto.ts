import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Price must be a number with at most 2 decimals' },
  )
  @Min(0, { message: 'Price must be >= 0' })
  @IsNotEmpty()
  price: number; // Money in Bs., up to 2 decimals

  @IsUUID()
  @IsNotEmpty()
  categoryId: string; // UUID de la categoría

  @IsUUID()
  @IsOptional()
  stockGroupId?: string; // UUID del grupo de stock (opcional)

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(0, { message: 'Individual stock must be >= 0' })
  individualStock?: number; // Stock individual (opcional - se puede registrar después)
}
