import { Prisma } from '@prisma/client';
import { money } from '../../common/money';
import { overpaymentPolicyFor } from './overpayment-policy';

export interface AllocationInput {
  pendingBalance: Prisma.Decimal.Value;
  amountReceived: Prisma.Decimal.Value;
  methodCode: string;
  isExtraTip?: boolean;
}

export type AllocationResult =
  | { kind: 'INVALID_AMOUNT' }
  | { kind: 'NO_PENDING_BALANCE' }
  | {
      kind: 'NEEDS_TIP_CONFIRMATION';
      amountReceived: Prisma.Decimal;
      pendingBalance: Prisma.Decimal;
      difference: Prisma.Decimal;
    }
  | {
      kind: 'ALLOCATED';
      amountReceived: Prisma.Decimal;
      amountApplied: Prisma.Decimal;
      changeAmount: Prisma.Decimal | null;
      tipAmount: Prisma.Decimal;
      remainingBalance: Prisma.Decimal;
      closesOrder: boolean;
    };

export function allocatePayment(input: AllocationInput): AllocationResult {
  const pending = money(input.pendingBalance);
  const received = money(input.amountReceived);
  const zero = new Prisma.Decimal(0);

  if (pending.lte(0)) return { kind: 'NO_PENDING_BALANCE' };
  if (received.lte(0)) return { kind: 'INVALID_AMOUNT' };

  if (received.lt(pending)) {
    return {
      kind: 'ALLOCATED',
      amountReceived: received,
      amountApplied: received,
      changeAmount: null,
      tipAmount: zero,
      remainingBalance: money(pending.sub(received)),
      closesOrder: false,
    };
  }

  const excess = money(received.sub(pending));
  const base = {
    kind: 'ALLOCATED' as const,
    amountReceived: received,
    amountApplied: pending,
    remainingBalance: zero,
    closesOrder: true,
  };

  const decision = overpaymentPolicyFor(input.methodCode).resolve(
    excess,
    input.isExtraTip ?? false,
  );

  if (decision.kind === 'NEEDS_TIP_CONFIRMATION') {
    return {
      kind: 'NEEDS_TIP_CONFIRMATION',
      amountReceived: received,
      pendingBalance: pending,
      difference: decision.difference,
    };
  }

  return {
    ...base,
    changeAmount: decision.changeAmount,
    tipAmount: decision.tipAmount,
  };
}
