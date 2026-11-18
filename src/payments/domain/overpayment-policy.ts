import { Prisma } from '@prisma/client';

export type OverpaymentDecision =
  | {
      kind: 'SETTLED';
      changeAmount: Prisma.Decimal | null;
      tipAmount: Prisma.Decimal;
    }
  | { kind: 'NEEDS_TIP_CONFIRMATION'; difference: Prisma.Decimal };

export interface OverpaymentPolicy {
  resolve(excess: Prisma.Decimal, isExtraTip: boolean): OverpaymentDecision;
}

export class CashOverpaymentPolicy implements OverpaymentPolicy {
  resolve(excess: Prisma.Decimal): OverpaymentDecision {
    return {
      kind: 'SETTLED',
      changeAmount: excess,
      tipAmount: new Prisma.Decimal(0),
    };
  }
}

export class TipOverpaymentPolicy implements OverpaymentPolicy {
  resolve(excess: Prisma.Decimal, isExtraTip: boolean): OverpaymentDecision {
    if (excess.gt(0) && !isExtraTip) {
      return { kind: 'NEEDS_TIP_CONFIRMATION', difference: excess };
    }
    return { kind: 'SETTLED', changeAmount: null, tipAmount: excess };
  }
}

const DEFAULT_POLICY: OverpaymentPolicy = new TipOverpaymentPolicy();

const POLICIES: Readonly<Record<string, OverpaymentPolicy>> = {
  CASH: new CashOverpaymentPolicy(),
};

export function overpaymentPolicyFor(methodCode: string): OverpaymentPolicy {
  return POLICIES[methodCode.toUpperCase()] ?? DEFAULT_POLICY;
}
