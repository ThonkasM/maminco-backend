import PDFDocument from 'pdfkit';

export interface ClosureRow {
  label: string;
  totalSales: number;
  totalOrders: number;
}

export interface ClosurePdfData {
  businessDate: string;
  generatedAt: Date;
  closedBy: string;
  early: boolean;
  openOrders: number;
  summary: {
    totalSales: number;
    totalOrders: number;
    averageOrderValue: number;
    totalDiscount: number;
    totalTips: number;
    tableOrders: number;
    virtualOrders: number;
    totalItems: number;
  };
  payments: ClosureRow[];
  shifts: ClosureRow[];
  topProducts: {
    productName: string;
    categoryName: string;
    quantitySold: number;
    totalRevenue: number;
  }[];
  cash: { received: number; applied: number; change: number; tips: number };
}

type RGB = [number, number, number];

const CHARCOAL: RGB = [25, 25, 25];
const LEAF: RGB = [76, 143, 33];
const CREAM: RGB = [244, 239, 228];
const INK: RGB = [26, 23, 19];
const MUTED: RGB = [112, 104, 92];
const LINE: RGB = [229, 220, 203];
const PAPER: RGB = [250, 247, 240];
const AMBER: RGB = [224, 149, 58];
const PALETTE: RGB[] = [
  [53, 112, 26],
  [230, 162, 26],
  [217, 86, 26],
  [15, 122, 82],
  [122, 106, 85],
];

const MARGIN = 40;
const WIDTH = 595.28;
const HEIGHT = 841.89;
const CONTENT = WIDTH - MARGIN * 2;

const money = (value: number) =>
  `Bs. ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const integer = (value: number) => Math.round(value).toLocaleString('es-BO');
const percent = (part: number, total: number) =>
  total > 0
    ? `${((part / total) * 100).toLocaleString('es-BO', { maximumFractionDigits: 1 })} %`
    : '—';

function longDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(
    'es-BO',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
}

/** One-page-ish "cierre de caja" report. Every figure comes from ReportsService. */
export function buildClosurePdf(data: ClosurePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Cierre de caja ${data.businessDate}`,
        Author: 'Maminco',
        Subject: 'Cierre de caja',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = 0;
    const ensure = (needed: number) => {
      if (y + needed > HEIGHT - 60) {
        doc.addPage();
        y = MARGIN;
      }
    };
    const heading = (text: string) => {
      ensure(40);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(text, MARGIN, y, { lineBreak: false });
      doc.rect(MARGIN, y + 17, 26, 2).fill(LEAF);
      y += 30;
    };

    // Header band
    doc.rect(0, 0, WIDTH, 96).fill(CHARCOAL);
    doc.rect(0, 96, WIDTH, 4).fill(LEAF);
    doc
      .fillColor(CREAM)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('MAMINCO  ·  SISTEMA DE GESTIÓN', MARGIN, 24, {
        lineBreak: false,
        characterSpacing: 1,
      });
    doc.fontSize(26).text('Cierre de caja', MARGIN, 40, { lineBreak: false });
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor([214, 206, 190])
      .text(longDate(data.businessDate), MARGIN, 72, { lineBreak: false });
    y = 120;

    // Metadata
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5);
    doc.text('DÍA DE NEGOCIO', MARGIN, y, { lineBreak: false });
    doc.text('GENERADO', MARGIN + 170, y, { lineBreak: false });
    doc.text('CERRADO POR', MARGIN + 340, y, { lineBreak: false });
    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.text(data.businessDate, MARGIN, y + 11, { lineBreak: false });
    doc.text(
      data.generatedAt.toLocaleString('es-BO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/La_Paz',
      }),
      MARGIN + 170,
      y + 11,
      { lineBreak: false },
    );
    doc.text(data.closedBy, MARGIN + 340, y + 11, {
      lineBreak: false,
      width: 180,
    });
    y += 38;

    if (data.early) {
      doc.roundedRect(MARGIN, y, CONTENT, 34, 4).fill([255, 244, 222]);
      doc.rect(MARGIN, y, 4, 34).fill(AMBER);
      doc
        .fillColor([120, 72, 12])
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('Cierre anticipado', MARGIN + 14, y + 7, { lineBreak: false });
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          'Se generó antes de que terminara el día de negocio: las ventas posteriores no están incluidas.',
          MARGIN + 14,
          y + 19,
          { lineBreak: false },
        );
      y += 46;
    }
    if (data.openOrders > 0) {
      doc.roundedRect(MARGIN, y, CONTENT, 28, 4).fill([253, 233, 231]);
      doc.rect(MARGIN, y, 4, 28).fill([198, 40, 40]);
      doc
        .fillColor([120, 24, 24])
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          `${data.openOrders} orden${data.openOrders === 1 ? '' : 'es'} abierta${data.openOrders === 1 ? '' : 's'} al cerrar: no ${data.openOrders === 1 ? 'entra' : 'entran'} en estas cifras.`,
          MARGIN + 14,
          y + 10,
          { lineBreak: false },
        );
      y += 40;
    }

    // KPIs
    heading('Resumen del día');
    const s = data.summary;
    const kpis: [string, string, string?][] = [
      ['VENTAS', money(s.totalSales)],
      [
        'ÓRDENES',
        integer(s.totalOrders),
        `${integer(s.tableOrders)} mesa · ${integer(s.virtualOrders)} virtual`,
      ],
      ['TICKET PROMEDIO', money(s.averageOrderValue)],
      ['ÍTEMS VENDIDOS', integer(s.totalItems)],
      [
        'DESCUENTOS',
        money(s.totalDiscount),
        percent(s.totalDiscount, s.totalSales + s.totalDiscount) +
          ' de la venta bruta',
      ],
      ['PROPINAS', money(s.totalTips)],
    ];
    const boxW = (CONTENT - 12 * 2) / 3;
    kpis.forEach(([label, value, detail], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = MARGIN + col * (boxW + 12);
      const top = y + row * 62;
      doc.roundedRect(x, top, boxW, 52, 4).fillAndStroke(PAPER, LINE);
      doc
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(label, x + 10, top + 8, { lineBreak: false });
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(value, x + 10, top + 19, { lineBreak: false, width: boxW - 16 });
      if (detail)
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(7)
          .text(detail, x + 10, top + 39, {
            lineBreak: false,
            width: boxW - 16,
          });
    });
    y += 2 * 62 + 8;

    // Payments
    heading('Ventas por método de pago');
    const paymentTotal = data.payments.reduce(
      (sum, item) => sum + item.totalSales,
      0,
    );
    if (data.payments.length === 0) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text('Sin pagos registrados.', MARGIN, y, { lineBreak: false });
      y += 22;
    }
    data.payments.forEach((item, index) => {
      ensure(26);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(item.label, MARGIN, y, { lineBreak: false, width: 130 });
      doc
        .font('Helvetica')
        .fillColor(MUTED)
        .fontSize(8.5)
        .text(
          `${integer(item.totalOrders)} ${item.totalOrders === 1 ? 'orden' : 'órdenes'}`,
          MARGIN + 130,
          y + 1,
          {
            lineBreak: false,
          },
        );
      const barX = MARGIN + 210;
      const barW = 170;
      doc.roundedRect(barX, y + 1, barW, 9, 3).fill(PAPER);
      const fill =
        paymentTotal > 0 ? (item.totalSales / paymentTotal) * barW : 0;
      if (fill > 0)
        doc
          .roundedRect(barX, y + 1, Math.max(fill, 4), 9, 3)
          .fill(PALETTE[index % PALETTE.length]);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(money(item.totalSales), barX + barW + 10, y, {
          lineBreak: false,
          width: 70,
          align: 'right',
        });
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8.5)
        .text(percent(item.totalSales, paymentTotal), barX + barW + 84, y + 1, {
          lineBreak: false,
        });
      y += 22;
    });
    y += 8;

    // Shifts: table + donut
    heading('Ventas por turno');
    ensure(130);
    const shiftTotal = data.shifts.reduce(
      (sum, item) => sum + item.totalSales,
      0,
    );
    data.shifts.forEach((item, index) => {
      const top = y + index * 24;
      doc.rect(MARGIN, top + 2, 9, 9).fill(PALETTE[index % PALETTE.length]);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(item.label, MARGIN + 16, top, { lineBreak: false, width: 110 });
      doc
        .font('Helvetica')
        .fillColor(MUTED)
        .fontSize(8.5)
        .text(
          `${integer(item.totalOrders)} ${item.totalOrders === 1 ? 'orden' : 'órdenes'}`,
          MARGIN + 126,
          top + 1,
          {
            lineBreak: false,
          },
        );
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(money(item.totalSales), MARGIN + 200, top, {
          lineBreak: false,
          width: 90,
          align: 'right',
        });
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8.5)
        .text(percent(item.totalSales, shiftTotal), MARGIN + 300, top + 1, {
          lineBreak: false,
        });
    });
    const cx = MARGIN + CONTENT - 62;
    const cy = y + 54;
    const outer = 54;
    const inner = 32;
    if (shiftTotal > 0) {
      let angle = -Math.PI / 2;
      data.shifts.forEach((item, index) => {
        if (item.totalSales <= 0) return;
        const sweep = (item.totalSales / shiftTotal) * Math.PI * 2;
        const color = PALETTE[index % PALETTE.length];
        if (sweep >= Math.PI * 2 - 1e-6) {
          doc.circle(cx, cy, outer).fill(color);
        } else {
          const end = angle + sweep;
          const large = sweep > Math.PI ? 1 : 0;
          const p = (r: number, a: number) =>
            `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
          doc
            .path(
              `M ${p(outer, angle)} A ${outer} ${outer} 0 ${large} 1 ${p(outer, end)} L ${cx} ${cy} Z`,
            )
            .fill(color);
          angle = end;
        }
      });
      doc.circle(cx, cy, inner).fill('#ffffff');
      doc
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('TOTAL', cx - 20, cy - 8, {
          width: 40,
          align: 'center',
          lineBreak: false,
        });
      doc
        .fillColor(INK)
        .fontSize(8)
        .text(integer(shiftTotal), cx - 22, cy + 1, {
          width: 44,
          align: 'center',
          lineBreak: false,
        });
    } else {
      doc.circle(cx, cy, outer).lineWidth(1).stroke(LINE);
    }
    y += Math.max(data.shifts.length * 24, 118) + 14;

    // Cash
    heading('Efectivo');
    ensure(70);
    const cash: [string, string][] = [
      ['Recibido en efectivo', money(data.cash.received)],
      ['Aplicado a ventas', money(data.cash.applied)],
      ['Vuelto entregado', money(data.cash.change)],
      ['Propinas en efectivo', money(data.cash.tips)],
    ];
    const cashW = (CONTENT - 36) / 4;
    cash.forEach(([label, value], index) => {
      const x = MARGIN + index * (cashW + 12);
      doc.roundedRect(x, y, cashW, 46, 4).fillAndStroke(PAPER, LINE);
      doc
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .fontSize(6.8)
        .text(label.toUpperCase(), x + 8, y + 8, {
          lineBreak: false,
          width: cashW - 12,
        });
      doc
        .fillColor(INK)
        .fontSize(11.5)
        .text(value, x + 8, y + 24, { lineBreak: false, width: cashW - 12 });
    });
    y += 66;

    // Top products
    heading('Productos más vendidos');
    ensure(40);
    doc.rect(MARGIN, y, CONTENT, 18).fill(CHARCOAL);
    doc.fillColor(CREAM).font('Helvetica-Bold').fontSize(8);
    doc.text('PRODUCTO', MARGIN + 8, y + 5, { lineBreak: false });
    doc.text('CATEGORÍA', MARGIN + 220, y + 5, { lineBreak: false });
    doc.text('UNIDADES', MARGIN + 330, y + 5, {
      lineBreak: false,
      width: 60,
      align: 'right',
    });
    doc.text('INGRESOS', MARGIN + 400, y + 5, {
      lineBreak: false,
      width: CONTENT - 408,
      align: 'right',
    });
    y += 18;
    if (data.topProducts.length === 0) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text('Sin ventas de productos.', MARGIN + 8, y + 8, {
          lineBreak: false,
        });
      y += 28;
    }
    data.topProducts.slice(0, 10).forEach((item, index) => {
      ensure(20);
      if (index % 2 === 0) doc.rect(MARGIN, y, CONTENT, 18).fill(PAPER);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text(item.productName, MARGIN + 8, y + 5, {
          lineBreak: false,
          width: 205,
        });
      doc
        .font('Helvetica')
        .fillColor(MUTED)
        .text(item.categoryName, MARGIN + 220, y + 5, {
          lineBreak: false,
          width: 100,
        });
      doc.fillColor(INK).text(integer(item.quantitySold), MARGIN + 330, y + 5, {
        lineBreak: false,
        width: 60,
        align: 'right',
      });
      doc
        .font('Helvetica-Bold')
        .text(money(item.totalRevenue), MARGIN + 400, y + 5, {
          lineBreak: false,
          width: CONTENT - 408,
          align: 'right',
        });
      y += 18;
    });

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .moveTo(MARGIN, HEIGHT - 40)
        .lineTo(WIDTH - MARGIN, HEIGHT - 40)
        .lineWidth(0.5)
        .stroke(LINE);
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
      doc.text(
        `Maminco · Cierre de caja ${data.businessDate} · Documento interno y confidencial`,
        MARGIN,
        HEIGHT - 30,
        { lineBreak: false },
      );
      doc.text(
        `Página ${i + 1} de ${range.count}`,
        WIDTH - MARGIN - 100,
        HEIGHT - 30,
        { lineBreak: false, width: 100, align: 'right' },
      );
    }
    doc.end();
  });
}
