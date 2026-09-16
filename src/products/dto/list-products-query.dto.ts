import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, IsUUID, IsBoolean } from 'class-validator';

export class ListProductsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 10;

    @IsOptional()
    search?: string; // Buscar por nombre o descripción

    @IsUUID()
    @IsOptional()
    categoryId?: string; // Filtrar por categoría

    @IsUUID()
    @IsOptional()
    stockGroupId?: string; // Filtrar por grupo de stock

    @IsBoolean()
    @IsOptional()
    isAvailable?: boolean; // Filtrar disponibles/no disponibles

    @IsBoolean()
    @IsOptional()
    hasIndividualStock?: boolean; // Filtrar por tipo de stock
}
