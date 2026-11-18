import { Prisma } from '@prisma/client';
import { money, multiplyMoney, nonNegative } from '../../common/money';

type Amount = Prisma.Decimal.Value;

export interface PricedLine {
  unitPrice: Amount;
  quantity: number;
  discountAmount?: Amount | null;
}

export type DiscountInput = { percentage?: number; fixed?: number };

export type DiscountResult =
  | { ok: true; amount: Prisma.Decimal; type: 'percentage' | 'fixed' }
  | {
      ok: false;
      reason: 'MISSING' | 'BOTH' | 'PERCENT_RANGE' | 'NEGATIVE' | 'EXCEEDS';
    };

export function lineSubtotal(unitPrice: Amount, quantity: number) {
  return multiplyMoney(unitPrice, quantity);
}

export function calculateSubtotal(lines: PricedLine[]): Prisma.Decimal {
  let sum = new Prisma.Decimal(0);
  for (const line of lines) {
    sum = sum
      .add(new Prisma.Decimal(line.unitPrice).mul(line.quantity))
      .sub(line.discountAmount ?? 0);
  }
  return money(sum);
}

export function calculateTotal(
  subtotal: Amount,
  discount: Amount,
  tip: Amount,
): Prisma.Decimal {
  return nonNegative(
    money(new Prisma.Decimal(subtotal).sub(discount).add(tip)),
  );
}

export function calculateDiscount(
  subtotal: Amount,
  input: DiscountInput,
): DiscountResult {
  const { percentage, fixed } = input;
  if (!percentage && !fixed) return { ok: false, reason: 'MISSING' };
  if (percentage && fixed) return { ok: false, reason: 'BOTH' };

  const base = new Prisma.Decimal(subtotal);
  if (percentage) {
    if (percentage < 0 || percentage > 100) {
      return { ok: false, reason: 'PERCENT_RANGE' };
    }
    return {
      ok: true,
      type: 'percentage',
      amount: money(base.mul(percentage).div(100)),
    };
  }

  if ((fixed as number) < 0) return { ok: false, reason: 'NEGATIVE' };
  const amount = money(fixed as number);
  if (amount.gt(base)) return { ok: false, reason: 'EXCEEDS' };
  return { ok: true, type: 'fixed', amount };
}

export function pendingBalance(total: Amount, paid: Amount): Prisma.Decimal {
  return money(new Prisma.Decimal(total).sub(paid));
}

export function isFullyPaid(total: Amount, paid: Amount): boolean {
  return pendingBalance(total, paid).lte(0);
}

export function formatOrderNumber(sequence: number | bigint): string {
  return sequence.toString().padStart(6, '0');
}
