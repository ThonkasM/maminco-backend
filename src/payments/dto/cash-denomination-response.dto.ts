/**
 * DTO para respuesta de denominación de efectivo
 * 
 * Ejemplo:
 * {
 *   "id": "denom-001",
 *   "value": 100,
 *   "type": "BILL",
 *   "quantity": 15,
 *   "total": 1500,  // 100 * 15
 *   "isActive": true
 * }
 */
export class CashDenominationResponseDto {
    id: string;
    value: number; // 1, 2, 5, 10, 20, 50, 100, 200
    type: string; // COIN o BILL
    quantity: number; // Cantidad disponible en caja
    total: number; // value * quantity
    isActive: boolean;
}
