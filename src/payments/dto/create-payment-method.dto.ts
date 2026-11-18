import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  name: string; // Cash, Bank transfer, Card, etc.

  @IsString()
  @IsNotEmpty()
  code: string; // CASH, TRANSFER, CARD - para programación

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
