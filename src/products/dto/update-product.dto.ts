import { IsString, IsOptional, IsUUID, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @Type(() => Number)
    @IsInt({ message: 'Price must be an integer (no decimals)' })
    @Min(0, { message: 'Price must be >= 0' })
    @IsOptional()
    price?: number; // Precio entero (sin decimales)

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
