import { IsString, IsNumber, Min, IsNotEmpty, IsOptional, IsDecimal } from 'class-validator';

/**
 * DTO para procesar un pago en una orden
 * 
 * Ejemplo:
 * {
 *   "orderId": "abc123",
 *   "amount": 250.50,
 *   "paymentMethodId": "cash-001",
 *   "notes": "Pago efectivo en mesa 5"
 * }
 */
export class CreatePaymentDto {
    /**
     * ID de la orden a pagar
     */
    @IsString()
    @IsNotEmpty({ message: 'El ID de la orden es requerido' })
    orderId: string;

    /**
     * Monto a pagar
     * Debe ser positivo y no debe exceder el total de la orden
     */
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01, { message: 'El monto debe ser mayor a 0' })
    @IsNotEmpty({ message: 'El monto es requerido' })
    amount: number;

    /**
     * ID del método de pago (EFECTIVO, TARJETA, TRANSFERENCIA, etc.)
     */
    @IsString()
    @IsNotEmpty({ message: 'El método de pago es requerido' })
    paymentMethodId: string;

    /**
     * Notas adicionales sobre el pago (opcional)
     */
    @IsOptional()
    @IsString()
    notes?: string;
}
