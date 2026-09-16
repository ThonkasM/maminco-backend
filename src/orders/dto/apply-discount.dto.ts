import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';

export class ApplyDiscountDto {
    @IsInt()
    @Min(0)
    @Max(100)
    percentageDiscount?: number; // Descuento en porcentaje (0-100%)

    @IsInt()
    @Min(0)
    fixedDiscount?: number; // Descuento fijo en monto

    @IsString()
    @IsOptional()
    reason?: string; // Razón del descuento (ej: "Cortesía", "Promoción", etc.)
}
