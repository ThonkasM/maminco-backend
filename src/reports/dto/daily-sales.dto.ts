export class DailySalesDto {
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  totalDiscount: number;
  totalTips: number;
  mesaOrders: number;
  virtualOrders: number;
}

export class TopProductDto {
  productId: string;
  productName: string;
  categoryName: string;
  quantitySold: number;
  unitPrice: number;
  totalRevenue: number;
}

export class DailyReportDto {
  date: Date;
  sales: DailySalesDto;
  topProducts: TopProductDto[];
}
