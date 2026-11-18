export interface TicketItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OrderTicketData {
  orderNumber: string;
  items: TicketItem[];
  subtotal: number;
  discount?: number;
  total: number;
  table?: string;
  customerName?: string;
  notes?: string;
}

export interface ReceiptPayment {
  method: string;
  received: number;
  applied: number;
  change?: number;
  tip?: number;
}

export interface PaymentReceiptData {
  orderNumber: string;
  items: TicketItem[];
  orderSubtotal: number;
  orderDiscount?: number;
  orderTotal: number;
  table?: string;
  payments: ReceiptPayment[];
  totalReceived: number;
  totalApplied: number;
  totalChange: number;
  totalTip: number;
}

export interface PrintResult {
  success: boolean;
  message: string;
}
