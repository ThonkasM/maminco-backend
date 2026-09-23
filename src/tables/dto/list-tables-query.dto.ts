import { IsEnum, IsOptional } from 'class-validator';
import { TableStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ListTablesQueryDto {
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
  @Type(() => Number)
  number?: number; // Filtrar por número de mesa

  @IsOptional()
  areaId?: string; // Filtrar por área

  @IsEnum(TableStatus)
  @IsOptional()
  status?: TableStatus; // Filtrar por estado (AVAILABLE, OCCUPIED, RESERVED)
}
