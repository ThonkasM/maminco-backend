import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO para actualizar un método de pago
 */
export class UpdatePaymentMethodDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    code?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
