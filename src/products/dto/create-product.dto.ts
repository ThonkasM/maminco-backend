import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
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
  @IsInt({ message: 'Price must be an integer (no decimals)' })
  @Min(0, { message: 'Price must be >= 0' })
  @IsNotEmpty()
  price: number; // Precio entero (sin decimales)

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
