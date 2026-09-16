import { IsNumber, IsString, IsNotEmpty, Min, Max, IsIn } from 'class-validator';

/**
 * DTO para crear una nueva denominación de efectivo
 * Ejemplo:
 * {
 *   "value": 50,
 *   "type": "BILL"
 * }
 */
export class CreateCashDenominationDto {
    /**
     * Valor de la denominación en Bolivianos
     * Ej: 1, 2, 5, 10, 20, 50, 100, 200
     */
    @IsNumber()
    @Min(0.01)
    @Max(10000)
    value: number;

    /**
     * Tipo de denominación
     * COIN: Moneda
     * BILL: Billete
     */
    @IsString()
    @IsNotEmpty()
    @IsIn(['COIN', 'BILL'])
    type: string;
}
