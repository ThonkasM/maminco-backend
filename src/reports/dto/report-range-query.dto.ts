import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const BREAKDOWN_DIMENSIONS = [
  'area',
  'table',
  'category',
  'paymentMethod',
  'hour',
  'waiter',
] as const;

export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export class ReportRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string; // YYYY-MM-DD (business timezone), inclusive

  @IsOptional()
  @IsDateString()
  to?: string; // YYYY-MM-DD (business timezone), inclusive

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsUUID()
  tableId?: string;
}

export class ReportTimeSeriesQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month' = 'day';
}

export class ReportBreakdownQueryDto extends ReportRangeQueryDto {
  @IsIn(BREAKDOWN_DIMENSIONS)
  by: BreakdownDimension;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ReportTopProductsQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
