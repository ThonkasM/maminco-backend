import { buildClosurePdf, type ClosurePdfData } from './closure-pdf';

const data: ClosurePdfData = {
  businessDate: '2026-11-17',
  generatedAt: new Date('2026-11-18T10:00:00Z'),
  closedBy: 'Admin de Prueba',
  early: false,
  openOrders: 0,
  summary: {
    totalSales: 1234.5,
    totalOrders: 12,
    averageOrderValue: 102.88,
    totalDiscount: 20,
    totalTips: 35,
    tableOrders: 10,
    virtualOrders: 2,
    totalItems: 30,
  },
  payments: [
    { label: 'Efectivo', totalSales: 700, totalOrders: 7 },
    { label: 'Tarjeta', totalSales: 534.5, totalOrders: 5 },
  ],
  shifts: [
    { label: 'Día', totalSales: 800, totalOrders: 8 },
    { label: 'Noche', totalSales: 434.5, totalOrders: 4 },
  ],
  topProducts: Array.from({ length: 10 }, (_, i) => ({
    productName: `Plato ${i + 1}`,
    categoryName: 'PATO',
    quantitySold: 10 - i,
    totalRevenue: 250 * (10 - i),
  })),
  cash: { received: 750, applied: 700, change: 50, tips: 10 },
};

describe('buildClosurePdf', () => {
  it('produces a valid PDF', async () => {
    const buffer = await buildClosurePdf(data);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
    expect(buffer.subarray(-8).toString()).toContain('%%EOF');
  });

  it('handles empty days, early closures and a single full-circle shift', async () => {
    const buffer = await buildClosurePdf({
      ...data,
      early: true,
      openOrders: 2,
      payments: [],
      shifts: [{ label: 'Día', totalSales: 500, totalOrders: 3 }],
      topProducts: [],
    });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('survives a day without any sales', async () => {
    const buffer = await buildClosurePdf({
      ...data,
      summary: { ...data.summary, totalSales: 0, totalOrders: 0 },
      payments: [],
      shifts: [{ label: 'Día', totalSales: 0, totalOrders: 0 }],
      topProducts: [],
    });
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
