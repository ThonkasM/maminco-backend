import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MenuItem {
  name: string;
  price: number;
  legacyNames?: string[];
}

const MENU: Record<string, MenuItem[]> = {
  PATO: [
    { name: 'PATO CRIOLLO', price: 280 },
    { name: 'PATO MANDARÍN', price: 280 },
    { name: 'PATO CANTONESA', price: 280 },
    { name: 'PATO BBQ', price: 290 },
    { name: 'PATO LIMEÑA', price: 300 },
  ],
  CARNE: [
    {
      name: 'CUADRIL (PERSONAL)',
      price: 100,
      legacyNames: ['CUADRIL PERSONAL'],
    },
    { name: 'PACUMUTO (PERSONAL)', price: 100 },
    { name: 'BIFE CHORIZO', price: 100 },
  ],
  OTROS: [
    {
      name: 'COSTILLAS DE CERDO (MANDARÍN O BBQ)',
      price: 70,
      legacyNames: ['COSTILLAS DE CERDO'],
    },
    { name: 'ALITAS DE POLLO', price: 40 },
    { name: 'PORCIÓN EXTRA (YUCA/PLÁTANO/ARROZ)', price: 10 },
  ],
  BEBIDA: [
    { name: 'JARRA LIMONADA', price: 30 },
    { name: 'JARRA MOCOCHINCHI', price: 40 },
    { name: 'JARRA MARACUYÁ', price: 40 },
    { name: 'MEDIA JARRA LIMONADA', price: 15 },
    { name: 'MEDIA JARRA MOCOCHINCHI', price: 20 },
    { name: 'MEDIA JARRA MARACUYÁ', price: 20 },
    { name: 'GASEOSA PERSONAL', price: 12, legacyNames: ['GASEOSA'] },
    { name: 'VITAL', price: 10 },
    { name: 'GASEOSA FAMILIAR', price: 25 },
    { name: 'HUARI', price: 30 },
  ],
};

async function main() {
  let created = 0;
  let updated = 0;

  for (const [categoryName, items] of Object.entries(MENU)) {
    let category = await prisma.category.findFirst({
      where: { name: categoryName },
    });
    if (!category) {
      category = await prisma.category.create({ data: { name: categoryName } });
    } else if (category.deletedAt || !category.isActive) {
      category = await prisma.category.update({
        where: { id: category.id },
        data: { deletedAt: null, isActive: true },
      });
    }

    for (const item of items) {
      const names = [item.name, ...(item.legacyNames ?? [])];
      const existing = await prisma.product.findFirst({
        where: { name: { in: names }, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      const data = {
        name: item.name,
        price: new Prisma.Decimal(item.price),
        categoryId: category.id,
        isAvailable: true,
        isActive: true,
      };
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.product.create({ data });
        created++;
      }
    }
  }

  console.log(
    `Menú listo: ${created} productos creados, ${updated} actualizados.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
