import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';
import {
  AUDIT_ACTION_GROUPS,
  type AuditActionGroup,
} from '../domain/audit-actions';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuditOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** First business date (YYYY-MM-DD, inclusive). Defaults to the business day in progress. */
  @IsOptional()
  @Matches(DATE, { message: 'from debe ser YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to debe ser YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsEnum(AUDIT_ACTION_GROUPS)
  actionGroup?: AuditActionGroup;
}
