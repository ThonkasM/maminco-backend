import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Min,
  IsUUID,
  IsString,
  IsEnum,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class ListOrdersQueryDto {
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

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus; // Filtrar por estado

  @IsUUID()
  @IsOptional()
  tableId?: string; // Filtrar por mesa

  @IsString()
  @IsOptional()
  serviceType?: string; // Filtrar por tipo de servicio (Area.name)

  @IsUUID()
  @IsOptional()
  createdById?: string; // Filtrar por usuario que creó

  @IsOptional()
  @Type(() => Boolean)
  onlyOpen?: boolean; // Solo órdenes abiertas (BORRADOR)

  @IsOptional()
  sortBy?: 'createdAt' | 'total' | 'status'; // Ordenar por

  @IsOptional()
  sortOrder?: 'asc' | 'desc'; // Dirección de ordenamiento
}
