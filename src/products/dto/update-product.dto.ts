import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'Price must be a number with at most 2 decimals' },
  )
  @Min(0, { message: 'Price must be >= 0' })
  @IsOptional()
  price?: number; // Money in Bs., up to 2 decimals

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsUUID()
  @IsOptional()
  stockGroupId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Individual stock must be >= 0' })
  @IsOptional()
  individualStock?: number;

  @IsOptional()
  isAvailable?: boolean;

  @IsOptional()
  isActive?: boolean;
}
