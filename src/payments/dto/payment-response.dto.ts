export class PaymentResponseDto {
  id: string;
  orderId: string;
  orderNumber: string;
  amountReceived: number; // Lo que el cliente pagó
  amountApplied: number; // Lo que se aplicó a la cuenta
  changeAmount: number | null; // Cambio a dar (solo EFECTIVO)
  tipAmount: number; // Propina incluida
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

export class PaginatedPaymentResponseDto {
  data: PaymentResponseDto[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
