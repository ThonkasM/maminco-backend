/**
 * DTO de respuesta para un Pago
 * 
 * Ejemplo de respuesta EFECTIVO:
 * {
 *   "id": "pay-001",
 *   "orderId": "ord-123",
 *   "orderNumber": "000001",
 *   "amountReceived": 250.00,
 *   "amountApplied": 245.00,
 *   "changeAmount": 5.00,
 *   "tipAmount": 0.00,
 *   "paymentMethod": { "id": "pm-cash", "name": "EFECTIVO" },
 *   "createdBy": { "id": "user-1", "name": "Juan Pérez" },
 *   "createdAt": "2025-11-07T14:30:00.000Z"
 * }
 * 
 * Ejemplo de respuesta TARJETA CON PROPINA:
 * {
 *   "id": "pay-002",
 *   "orderId": "ord-124",
 *   "orderNumber": "000002",
 *   "amountReceived": 255.00,
 *   "amountApplied": 245.00,
 *   "changeAmount": null,
 *   "tipAmount": 10.00,
 *   "paymentMethod": { "id": "pm-card", "name": "TARJETA" },
 *   "createdBy": { "id": "user-1", "name": "Juan Pérez" },
 *   "createdAt": "2025-11-07T14:35:00.000Z"
 * }
 */
export class PaymentResponseDto {
    id: string;
    orderId: string;
    orderNumber: string;
    amountReceived: number;          // Lo que el cliente pagó
    amountApplied: number;           // Lo que se aplicó a la cuenta
    changeAmount: number | null;     // Cambio a dar (solo EFECTIVO)
    tipAmount: number;               // Propina incluida
    paymentMethod: {
        id: string;
        name: string;
    };
    createdBy: {
        id: string;
        name: string;
        email: string;
    };
    createdAt: Date;
}

/**
 * DTO de respuesta para listado paginado de pagos
 */
export class PaginatedPaymentResponseDto {
    data: PaymentResponseDto[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    };
}
