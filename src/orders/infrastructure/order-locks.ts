import { Prisma } from '@prisma/client';

export async function lockOrderRow(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
}

export async function lockTableRow(
  tx: Prisma.TransactionClient,
  tableId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "tables" WHERE "id" = ${tableId} FOR UPDATE`;
}

export async function releaseTableIfIdle(
  tx: Prisma.TransactionClient,
  tableId: string,
): Promise<boolean> {
  await lockTableRow(tx, tableId);
  const open = await tx.order.count({
    where: { tableId, status: 'DRAFT', deletedAt: null },
  });
  if (open > 0) return false;
  await tx.table.update({
    where: { id: tableId },
    data: { status: 'AVAILABLE' },
  });
  return true;
}
