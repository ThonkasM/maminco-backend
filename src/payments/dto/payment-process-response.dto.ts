/**
 * DTO para respuesta de procesamiento de pago
 * 
 * Casos posibles:
 * 
 * 1. PENDIENTE CONFIRMACIÓN (monto > total en TRANSFER/TARJETA)
 * {
 *   "status": "PENDING_CONFIRMATION",
 *   "message": "Monto mayor al total. ¿La diferencia de $10 es propina?",
 *   "difference": 10.00,
 *   "amountReceived": 255.00,
 *   "totalDue": 245.00
 * }
 * 
 * 2. PAGO COMPLETADO (EFECTIVO o TRANSFER/TARJETA exacto)
 * {
 *   "status": "COMPLETED",
 *   "message": "Pago completado. Cambio a dar: $5.00",
 *   "orderId": "ord-123",
 *   "orderNumber": "000001",
 *   "paymentId": "pay-001",
 *   "amountReceived": 250.00,
 *   "amountApplied": 245.00,
 *   "changeAmount": 5.00,
 *   "tipAmount": 0.00,
 *   "totalDue": 245.00,
 *   "paymentMethod": "EFECTIVO"
 * }
 * 
 * 3. PAGO CON PROPINA (TRANSFER/TARJETA con extra)
 * {
 *   "status": "COMPLETED",
 *   "message": "Pago completado. Propina de $10.00 registrada.",
 *   "orderId": "ord-124",
 *   "orderNumber": "000002",
 *   "paymentId": "pay-002",
 *   "amountReceived": 255.00,
 *   "amountApplied": 245.00,
 *   "changeAmount": null,
 *   "tipAmount": 10.00,
 *   "totalDue": 245.00,
 *   "paymentMethod": "TARJETA"
 * }
 * 
 * 4. ERROR
 * {
 *   "status": "ERROR",
 *   "message": "Monto insuficiente. Debe recibir mínimo $245.00",
 *   "error": "INSUFFICIENT_AMOUNT"
 * }
 */
export class PaymentProcessResponseDto {
    status: 'PENDING_CONFIRMATION' | 'COMPLETED' | 'ERROR' | 'PARTIAL_PAYMENT';
    message: string;

    // Datos del pago (si fue completado o está pendiente)
    orderId?: string;
    orderNumber?: string;
    paymentId?: string;
    amountReceived?: number;
    amountApplied?: number;
    changeAmount?: number | null;
    tipAmount?: number;
    totalDue?: number;
    paymentMethod?: string;

    // Estado de la orden después del pago
    // Importante: El backend CIERRA la orden automáticamente al registrar el pago
    // Esto permite al frontend saber que NO debe intentar cerrar de nuevo
    orderStatus?: 'CERRADO' | 'BORRADOR' | 'CANCELADO';

    // Para múltiples pagos parciales
    // Indica cuánto falta pagar después de este pago
    totalPaidSoFar?: number; // Total pagado hasta ahora (incluyendo este pago)
    pendingBalance?: number; // Saldo pendiente después de este pago
    isPaid?: boolean; // true si la orden está completamente pagada

    // Para confirmación de propina
    difference?: number;

    // Para errores
    error?: string;
}