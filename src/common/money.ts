import { Prisma } from '@prisma/client';

export type DecimalInput = Prisma.Decimal.Value;

const HUNDRED = new Prisma.Decimal(100);

/** Rounds a value to 2 decimals, half-up (money precision). */
export function money(value: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

/** unitPrice × quantity, rounded to 2 decimals. */
export function multiplyMoney(
  unitPrice: DecimalInput,
  quantity: number,
): Prisma.Decimal {
  return money(new Prisma.Decimal(unitPrice).mul(quantity));
}

/** Sum of decimal values, rounded to 2 decimals. */
export function sumMoney(values: DecimalInput[]): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const value of values) {
    total = total.add(new Prisma.Decimal(value));
  }
  return money(total);
}

/** a − b, rounded to 2 decimals. */
export function subtractMoney(
  a: DecimalInput,
  b: DecimalInput,
): Prisma.Decimal {
  return money(new Prisma.Decimal(a).sub(b));
}

/** percent% of value, rounded to 2 decimals. */
export function percentageOf(
  value: DecimalInput,
  percent: number,
): Prisma.Decimal {
  return money(new Prisma.Decimal(value).mul(percent).div(HUNDRED));
}

/** Clamps a decimal to a minimum of 0. */
export function nonNegative(value: Prisma.Decimal): Prisma.Decimal {
  return value.isNegative() ? new Prisma.Decimal(0) : value;
}
