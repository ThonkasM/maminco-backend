import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsString,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class ChangeOrderStatusDto {
  @IsEnum(OrderStatus)
  @IsNotEmpty()
  status: OrderStatus; // DRAFT | CLOSED | CANCELLED

  @IsOptional()
  @IsBoolean()
  autoPrint?: boolean;

  @IsOptional()
  @IsString()
  printerName?: string;
}
