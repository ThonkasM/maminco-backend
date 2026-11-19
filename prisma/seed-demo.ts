import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PREFIX = 'DEMO-';
const DEMO_MARK = 'DEMO';
const START_DATE = process.env.DEMO_START ?? '2026-06-01';
const UTC_OFFSET_HOURS = 4;
const OVERSHOOT = 1.04;

type DayKind = 'TUE_FRI' | 'SAT' | 'SUN';
type Group = 'PATO' | 'CARNE' | 'OTROS' | 'DRINK' | 'JARRA';

interface Dish {
  name: string;
  price: number;
  group: Group;
  weights: Record<DayKind, number>;
}

const CATALOG: Dish[] = [
  {
    name: 'PATO CRIOLLO',
    price: 280,
    group: 'PATO',
    weights: { TUE_FRI: 10, SAT: 16, SUN: 24 },
  },
  {
    name: 'PATO MANDARÍN',
    price: 280,
    group: 'PATO',
    weights: { TUE_FRI: 8, SAT: 12, SUN: 18 },
  },
  {
    name: 'PATO CANTONESA',
    price: 280,
    group: 'PATO',
    weights: { TUE_FRI: 4, SAT: 8, SUN: 12 },
  },
  {
    name: 'PATO BBQ',
    price: 290,
    group: 'PATO',
    weights: { TUE_FRI: 3, SAT: 6, SUN: 10 },
  },
  {
    name: 'PATO LIMEÑA',
    price: 300,
    group: 'PATO',
    weights: { TUE_FRI: 2, SAT: 4, SUN: 7 },
  },
  {
    name: 'CUADRIL (PERSONAL)',
    price: 100,
    group: 'CARNE',
    weights: { TUE_FRI: 14, SAT: 10, SUN: 5 },
  },
  {
    name: 'PACUMUTO (PERSONAL)',
    price: 100,
    group: 'CARNE',
    weights: { TUE_FRI: 10, SAT: 8, SUN: 4 },
  },
  {
    name: 'BIFE CHORIZO',
    price: 100,
    group: 'CARNE',
    weights: { TUE_FRI: 10, SAT: 8, SUN: 4 },
  },
  {
    name: 'COSTILLAS DE CERDO (MANDARÍN O BBQ)',
    price: 70,
    group: 'OTROS',
    weights: { TUE_FRI: 14, SAT: 8, SUN: 4 },
  },
  {
    name: 'ALITAS DE POLLO',
    price: 40,
    group: 'OTROS',
    weights: { TUE_FRI: 14, SAT: 8, SUN: 3 },
  },
  {
    name: 'PORCIÓN EXTRA (YUCA/PLÁTANO/ARROZ)',
    price: 10,
    group: 'OTROS',
    weights: { TUE_FRI: 4, SAT: 4, SUN: 6 },
  },
  {
    name: 'GASEOSA PERSONAL',
    price: 12,
    group: 'DRINK',
    weights: { TUE_FRI: 24, SAT: 18, SUN: 8 },
  },
  {
    name: 'VITAL',
    price: 10,
    group: 'DRINK',
    weights: { TUE_FRI: 10, SAT: 8, SUN: 4 },
  },
  {
    name: 'MEDIA JARRA LIMONADA',
    price: 15,
    group: 'DRINK',
    weights: { TUE_FRI: 8, SAT: 6, SUN: 2 },
  },
  {
    name: 'MEDIA JARRA MOCOCHINCHI',
    price: 20,
    group: 'DRINK',
    weights: { TUE_FRI: 6, SAT: 5, SUN: 2 },
  },
  {
    name: 'MEDIA JARRA MARACUYÁ',
    price: 20,
    group: 'DRINK',
    weights: { TUE_FRI: 6, SAT: 5, SUN: 2 },
  },
  {
    name: 'JARRA LIMONADA',
    price: 30,
    group: 'JARRA',
    weights: { TUE_FRI: 4, SAT: 12, SUN: 20 },
  },
  {
    name: 'JARRA MOCOCHINCHI',
    price: 40,
    group: 'JARRA',
    weights: { TUE_FRI: 3, SAT: 10, SUN: 18 },
  },
  {
    name: 'JARRA MARACUYÁ',
    price: 40,
    group: 'JARRA',
    weights: { TUE_FRI: 3, SAT: 10, SUN: 18 },
  },
  {
    name: 'GASEOSA FAMILIAR',
    price: 25,
    group: 'JARRA',
    weights: { TUE_FRI: 4, SAT: 12, SUN: 20 },
  },
  {
    name: 'HUARI',
    price: 30,
    group: 'JARRA',
    weights: { TUE_FRI: 2, SAT: 6, SUN: 10 },
  },
];

const BASKET_MIX: Record<DayKind, number[]> = {
  TUE_FRI: [70, 25, 5],
  SAT: [40, 40, 20],
  SUN: [10, 30, 60],
};

const HOURS: Record<DayKind, { hours: number[]; weights: number[] }> = {
  TUE_FRI: {
    hours: [12, 13, 14, 19, 20, 21],
    weights: [16, 24, 14, 12, 18, 8],
  },
  SAT: {
    hours: [12, 13, 14, 19, 20, 21, 22],
    weights: [10, 14, 10, 16, 24, 18, 8],
  },
  SUN: {
    hours: [11, 12, 13, 14, 15, 16, 18, 19],
    weights: [8, 24, 28, 22, 12, 6, 6, 4],
  },
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260601);

function int(min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rand() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function dayKind(weekday: number): DayKind | null {
  if (weekday === 0) return 'SUN';
  if (weekday === 6) return 'SAT';
  if (weekday >= 2 && weekday <= 5) return 'TUE_FRI';
  return null;
}

function dailyTarget(kind: DayKind): number {
  if (kind === 'SUN') return 8000 + rand() * 3000;
  if (kind === 'SAT') return 2000 * (0.9 + rand() * 0.2);
  return 600 * (0.88 + rand() * 0.24);
}

function localDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

interface ResolvedDish {
  dish: Dish;
  id: string;
}

interface Basket {
  lines: { entry: ResolvedDish; quantity: number }[];
  subtotal: number;
}

function pickGroup(
  catalog: ResolvedDish[],
  kind: DayKind,
  groups: Group[],
): ResolvedDish {
  const pool = catalog.filter((entry) => groups.includes(entry.dish.group));
  return pick(
    pool,
    pool.map((entry) => entry.dish.weights[kind]),
  );
}

function buildBasket(catalog: ResolvedDish[], kind: DayKind): Basket {
  const size = pick(['SOLO', 'PAREJA', 'FAMILIAR'], BASKET_MIX[kind]);
  const quantities = new Map<
    string,
    { entry: ResolvedDish; quantity: number }
  >();
  const add = (entry: ResolvedDish, quantity = 1) => {
    const current = quantities.get(entry.id);
    if (current) current.quantity += quantity;
    else quantities.set(entry.id, { entry, quantity });
  };

  if (size === 'SOLO') {
    add(pickGroup(catalog, kind, ['PATO', 'CARNE', 'OTROS']));
    add(pickGroup(catalog, kind, ['DRINK']));
  } else if (size === 'PAREJA') {
    for (let i = 0; i < 2; i++) {
      add(pickGroup(catalog, kind, ['PATO', 'CARNE', 'OTROS']));
    }
    add(pickGroup(catalog, kind, ['DRINK', 'JARRA']));
    if (rand() < 0.5) add(pickGroup(catalog, kind, ['DRINK']));
  } else {
    const mains = int(3, 6);
    for (let i = 0; i < mains; i++) {
      add(pickGroup(catalog, kind, ['PATO', 'PATO', 'CARNE', 'OTROS']));
    }
    const drinks = int(2, 4);
    for (let i = 0; i < drinks; i++) {
      add(pickGroup(catalog, kind, ['JARRA', 'JARRA', 'DRINK']));
    }
    if (rand() < 0.4) {
      const extra = catalog.find((entry) =>
        entry.dish.name.startsWith('PORCIÓN'),
      );
      if (extra) add(extra, int(1, 3));
    }
  }

  const lines = [...quantities.values()];
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.entry.dish.price,
    0,
  );
  return { lines, subtotal };
}

async function clean() {
  const orderIds = (
    await prisma.order.findMany({
      where: { orderNumber: { startsWith: DEMO_PREFIX } },
      select: { id: true },
    })
  ).map((order) => order.id);
  const productIds = (
    await prisma.product.findMany({
      where: { description: DEMO_MARK },
      select: { id: true },
    })
  ).map((product) => product.id);

  const [, , , , , removed, products, categories] = await prisma.$transaction([
    prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.auditLog.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.orderHistory.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.orderItemHistory.deleteMany({
      where: { productId: { in: productIds } },
    }),
    prisma.orderItem.deleteMany({
      where: {
        OR: [{ orderId: { in: orderIds } }, { productId: { in: productIds } }],
      },
    }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.product.deleteMany({ where: { id: { in: productIds } } }),
    prisma.category.deleteMany({
      where: { description: DEMO_MARK, products: { none: {} } },
    }),
  ]);
  console.log(
    `Demo eliminado: ${removed.count} órdenes, ${products.count} productos, ${categories.count} categorías.`,
  );
}

async function ensureCatalog(): Promise<ResolvedDish[]> {
  const existing = await prisma.product.findMany({
    where: { deletedAt: null },
  });
  const byName = new Map(existing.map((product) => [product.name, product]));
  const missing = CATALOG.filter((dish) => !byName.has(dish.name));
  if (missing.length) {
    throw new Error(
      `Faltan productos del menú (${missing.map((dish) => dish.name).join(', ')}). Ejecuta primero: npm run seed:menu`,
    );
  }
  return CATALOG.map((dish) => {
    const product = byName.get(dish.name)!;
    return { dish: { ...dish, price: Number(product.price) }, id: product.id };
  });
}

async function ensureVenue() {
  const existing = await prisma.table.count({
    where: { deletedAt: null, isActive: true },
  });
  if (existing > 0) return;
  const layout = [
    { name: 'SALÓN', tables: 8 },
    { name: 'EXTERIOR', tables: 4 },
  ];
  for (const entry of layout) {
    const area =
      (await prisma.area.findFirst({ where: { name: entry.name } })) ??
      (await prisma.area.create({ data: { name: entry.name } }));
    for (let number = 1; number <= entry.tables; number++) {
      await prisma.table.upsert({
        where: { areaId_number: { areaId: area.id, number } },
        update: { deletedAt: null, isActive: true },
        create: { areaId: area.id, number },
      });
    }
  }
  console.log('Áreas y mesas creadas (SALÓN 1-8, EXTERIOR 1-4).');
}

async function insertChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
) {
  const size = 1000;
  for (let i = 0; i < rows.length; i += size) {
    await insert(rows.slice(i, i + size));
  }
}

async function main() {
  if (process.argv.includes('--clean')) {
    await clean();
    return;
  }

  await clean();

  const catalog = await ensureCatalog();
  await ensureVenue();
  const tables = await prisma.table.findMany({
    where: { deletedAt: null, isActive: true },
    include: { area: true },
  });
  const methods = await prisma.paymentMethod.findMany({
    where: { deletedAt: null },
  });
  const waiter = await prisma.user.findFirst({ where: { role: 'WAITER' } });
  const cashier = await prisma.user.findFirst({ where: { role: 'CASHIER' } });
  if (!tables.length || !methods.length || !waiter || !cashier) {
    throw new Error(
      'Faltan mesas, métodos de pago o usuarios. Ejecuta el seed y crea al menos una mesa.',
    );
  }

  const methodByCode = new Map(methods.map((method) => [method.code, method]));
  const now = new Date();
  const todayKey = localDateKey(
    new Date(now.getTime() - UTC_OFFSET_HOURS * 3600000),
  );

  const orders: Prisma.OrderCreateManyInput[] = [];
  const items: Prisma.OrderItemCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const dayTotals = new Map<string, number>();

  const cursor = new Date(`${START_DATE}T12:00:00Z`);
  while (localDateKey(cursor) <= todayKey) {
    const dayKey = localDateKey(cursor);
    const kind = dayKind(cursor.getUTCDay());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!kind) continue;

    const target = dailyTarget(kind);
    const cap = target * OVERSHOOT;
    const schedule = HOURS[kind];
    let produced = 0;
    let sum = 0;
    let misses = 0;

    while (sum < target && misses < 40) {
      const basket = buildBasket(catalog, kind);
      const wantsTip = rand() < 0.12;
      const wantsDiscount = rand() < 0.05;
      const discount = wantsDiscount ? Math.round(basket.subtotal * 0.1) : 0;
      const tip = wantsTip ? Math.round(basket.subtotal * 0.08) : 0;
      const total = basket.subtotal - discount + tip;
      if (sum + total > cap) {
        misses++;
        continue;
      }

      const hour = pick(schedule.hours, schedule.weights);
      const minute = int(0, 59);
      const closedAt = new Date(
        `${dayKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`,
      );
      if (closedAt.getTime() > now.getTime()) {
        misses++;
        continue;
      }
      const createdAt = new Date(closedAt.getTime() - int(35, 75) * 60000);

      produced++;
      sum += total;
      const orderId = randomUUID();
      for (const line of basket.lines) {
        items.push({
          id: randomUUID(),
          orderId,
          productId: line.entry.id,
          quantity: line.quantity,
          unitPrice: new Prisma.Decimal(line.entry.dish.price),
          subtotal: new Prisma.Decimal(line.quantity * line.entry.dish.price),
          addedById: waiter.id,
          createdAt,
        });
      }

      const table = tables[int(0, tables.length - 1)];
      orders.push({
        id: orderId,
        orderNumber: `${DEMO_PREFIX}${dayKey.replace(/-/g, '')}-${String(produced).padStart(3, '0')}`,
        status: 'CLOSED',
        kitchenStatus: 'READY',
        serviceType: table.area?.name ?? 'MESA',
        subtotal: new Prisma.Decimal(basket.subtotal),
        discountAmount: new Prisma.Decimal(discount),
        tipAmount: new Prisma.Decimal(tip),
        total: new Prisma.Decimal(total),
        createdAt,
        closedAt,
        tableId: table.id,
        createdById: waiter.id,
        attendedById: waiter.id,
        closedById: cashier.id,
      });

      const code = pick(['CASH', 'TRANSFER', 'CARD'], [50, 30, 20]);
      const method = methodByCode.get(code) ?? methods[0];
      const received = code === 'CASH' ? Math.ceil(total / 10) * 10 : total;
      payments.push({
        id: randomUUID(),
        orderId,
        paymentMethodId: method.id,
        createdById: cashier.id,
        amountReceived: new Prisma.Decimal(received),
        amountApplied: new Prisma.Decimal(total),
        changeAmount:
          code === 'CASH' ? new Prisma.Decimal(received - total) : null,
        tipAmount: new Prisma.Decimal(0),
        createdAt: closedAt,
      });
    }
    dayTotals.set(dayKey, sum);
  }

  await insertChunks(orders, (data) => prisma.order.createMany({ data }));
  await insertChunks(items, (data) => prisma.orderItem.createMany({ data }));
  await insertChunks(payments, (data) => prisma.payment.createMany({ data }));

  const grand = [...dayTotals.values()].reduce((a, b) => a + b, 0);
  console.log(
    `Demo creado: ${dayTotals.size} días con ventas (${START_DATE} a ${todayKey}), ${orders.length} órdenes, ${items.length} ítems, ${payments.length} pagos, Bs ${grand.toFixed(2)} en total.`,
  );
  console.log('Para eliminarlo: npm run seed:demo:clean');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
