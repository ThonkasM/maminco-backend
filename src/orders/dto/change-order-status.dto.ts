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
  status: OrderStatus; // BORRADOR | CERRADO | CANCELADO

  /**
   * Si es true y el estado es CERRADO, automáticamente imprime la orden
   * Default: false
   */
  @IsOptional()
  @IsBoolean()
  autoPrint?: boolean;

  /**
   * Nombre de la impresora a usar (opcional)
   * Si no se proporciona, se usa la impresora por defecto del sistema
   */
  @IsOptional()
  @IsString()
  printerName?: string;
}
