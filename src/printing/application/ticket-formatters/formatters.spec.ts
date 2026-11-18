import { PaymentReceiptData, OrderTicketData } from '../../domain/ticket.types';
import { formatOrderTicket } from './order-ticket';
import { formatPaymentReceipt } from './payment-receipt';
import { formatTestTicket } from './test-ticket';

const NOW = new Date(2026, 9, 29, 14, 5);

const items = [
  {
    name: 'Pique Macho Especial Grande',
    quantity: 2,
    unitPrice: 45,
    subtotal: 90,
  },
  { name: 'Café', quantity: 1, unitPrice: 10.5, subtotal: 10.5 },
];

const plain = (buffer: Buffer) =>
  [...buffer.toString('utf8')]
    .filter((char) => char === '\n' || char.charCodeAt(0) >= 32)
    .join('');

describe('ticket formatters', () => {
  it('formats the test ticket and ends with a cut', () => {
    const buffer = formatTestTicket(NOW);
    expect(plain(buffer)).toContain('Fecha: 29/10/2026 14:05');
    expect([...buffer.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...buffer.subarray(-4)]).toEqual([0x1d, 0x56, 0x41, 0x03]);
  });

  describe('order ticket', () => {
    const data: OrderTicketData = {
      orderNumber: '0042',
      items,
      subtotal: 100.5,
      discount: 5,
      total: 95.5,
      table: '7',
      notes: 'Sin aji',
    };

    it('renders header, rows, totals and notes', () => {
      const text = plain(formatOrderTicket(data, NOW));
      expect(text).toContain('Orden #0042');
      expect(text).toContain('Mesa: 7');
      expect(text).toContain('Pique Macho Especi   2    45.00   Bs 90.00');
      expect(text).toContain('Cafe');
      expect(text).toContain('Subtotal: Bs 100.50');
      expect(text).toContain('Descuento: -Bs 5.00');
      expect(text).toContain('Total: Bs 95.50');
      expect(text).toContain('Sin aji');
    });

    it('omits optional sections', () => {
      const text = plain(
        formatOrderTicket(
          { ...data, discount: 0, notes: undefined, table: undefined },
          NOW,
        ),
      );
      expect(text).not.toContain('Descuento');
      expect(text).not.toContain('Notas');
      expect(text).not.toContain('Mesa:');
    });
  });

  describe('payment receipt', () => {
    const data: PaymentReceiptData = {
      orderNumber: '0042',
      items,
      orderSubtotal: 100.5,
      orderDiscount: 0,
      orderTotal: 100.5,
      table: '7',
      payments: [
        { method: 'Efectivo', received: 60, applied: 50.5, change: 9.5 },
        { method: 'Tarjeta', received: 50, applied: 50, tip: 2 },
      ],
      totalReceived: 110,
      totalApplied: 100.5,
      totalChange: 9.5,
      totalTip: 2,
    };

    it('lists every payment and accumulated totals', () => {
      const text = plain(formatPaymentReceipt(data, NOW));
      expect(text).toContain('Pago 1: Efectivo');
      expect(text).toContain('Pago 2: Tarjeta');
      expect(text).toContain('  Cambio: Bs 9.50');
      expect(text).toContain('  Propina: Bs 2.00');
      expect(text).toContain('Total Recibido: Bs 110.00');
      expect(text).toContain('Cambio Total: Bs 9.50');
      expect(text).toContain('Propina Total: Bs 2.00');
    });

    it('omits change and tip totals when zero', () => {
      const text = plain(
        formatPaymentReceipt(
          {
            ...data,
            totalChange: 0,
            totalTip: 0,
            payments: [data.payments[1]],
          },
          NOW,
        ),
      );
      expect(text).not.toContain('Cambio Total');
      expect(text).not.toContain('Propina Total');
    });
  });

  describe('shared document template', () => {
    const base = { orderNumber: '9', items, table: '3' };
    const order = plain(
      formatOrderTicket({ ...base, subtotal: 10, total: 10 }, NOW),
    );
    const receipt = plain(
      formatPaymentReceipt(
        {
          ...base,
          orderSubtotal: 10,
          orderTotal: 10,
          payments: [],
          totalReceived: 0,
          totalApplied: 0,
          totalChange: 0,
          totalTip: 0,
        },
        NOW,
      ),
    );

    it('uses the same header skeleton in both documents', () => {
      for (const text of [order, receipt]) {
        expect(text).toContain('MAMINCO');
        expect(text).toContain('Orden #9');
        expect(text).toContain('Mesa: 3');
        expect(text).toContain('Fecha: 29/10/2026 14:05');
        expect(text).toContain('Gracias por su compra');
      }
    });

    it('lets each document customise its own hooks', () => {
      expect(receipt).toContain('RECIBO DE PAGO');
      expect(receipt).toContain('Visitenos pronto');
      expect(order).not.toContain('RECIBO DE PAGO');
      expect(order).not.toContain('Visitenos pronto');
    });
  });
});
