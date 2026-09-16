/**
 * DTO de respuesta para los Métodos de Pago
 * 
 * Ejemplo:
 * {
 *   "id": "pm-cash",
 *   "name": "EFECTIVO",
 *   "code": "CASH",
 *   "description": "Pago en efectivo en caja",
 *   "isActive": true,
 *   "createdAt": "2025-11-07T10:00:00Z",
 *   "updatedAt": "2025-11-07T10:00:00Z"
 * }
 */
export class PaymentMethodResponseDto {
    id: string;
    name: string;
    code: string;
    description?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}