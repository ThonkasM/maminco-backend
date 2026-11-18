import {
  IsString,
  IsNumber,
  Min,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class ProcessPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'El método de pago es requerido' })
  paymentMethodId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  @IsNotEmpty({ message: 'El monto recibido es requerido' })
  amountReceived: number;

  @IsOptional()
  @IsBoolean()
  isExtraTip?: boolean;

  /**
   * Notas adicionales (opcional)
   */
  @IsOptional()
  @IsString()
  notes?: string;
}
