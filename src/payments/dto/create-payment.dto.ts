import {
  IsString,
  IsNumber,
  Min,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'El ID de la orden es requerido' })
  orderId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  @IsNotEmpty({ message: 'El monto es requerido' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'El método de pago es requerido' })
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
