import { IsString, IsDateString, IsOptional } from 'class-validator';

/**
 * DTO para filtrar y listar pagos
 * 
 * Ejemplo:
 * {
 *   "orderId": "abc123",
 *   "paymentMethodId": "cash-001",
 *   "startDate": "2025-11-01",
 *   "endDate": "2025-11-07",
 *   "page": 1,
 *   "limit": 20
 * }
 */
export class ListPaymentsQueryDto {
    /**
     * Filtrar por ID de orden (opcional)
     */
    @IsOptional()
    @IsString()
    orderId?: string;

    /**
     * Filtrar por método de pago (opcional)
     */
    @IsOptional()
    @IsString()
    paymentMethodId?: string;

    /**
     * Filtrar por ID de usuario que registró el pago (opcional)
     */
    @IsOptional()
    @IsString()
    createdById?: string;

    /**
     * Fecha de inicio (formato ISO: 2025-11-01) (opcional)
     */
    @IsOptional()
    @IsDateString()
    startDate?: string;

    /**
     * Fecha de fin (formato ISO: 2025-11-07) (opcional)
     */
    @IsOptional()
    @IsDateString()
    endDate?: string;

    /**
     * Número de página (default: 1)
     */
    page?: number = 1;

    /**
     * Límite de registros por página (default: 20, max: 100)
     */
    limit?: number = 20;
}
