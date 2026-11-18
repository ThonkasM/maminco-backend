export class CashDenominationResponseDto {
  id: string;
  value: number; // 1, 2, 5, 10, 20, 50, 100, 200
  type: string; // COIN o BILL
  quantity: number; // Cantidad disponible en caja
  total: number; // value * quantity
  isActive: boolean;
}
