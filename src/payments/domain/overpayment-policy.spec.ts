import { Prisma } from '@prisma/client';
import {
  CashOverpaymentPolicy,
  overpaymentPolicyFor,
  TipOverpaymentPolicy,
} from './overpayment-policy';

const d = (value: string) => new Prisma.Decimal(value);

describe('overpayment policies', () => {
  it('cash returns the excess as change and no tip', () => {
    const decision = new CashOverpaymentPolicy().resolve(d('5.00'));
    expect(decision.kind).toBe('SETTLED');
    if (decision.kind === 'SETTLED') {
      expect(decision.changeAmount?.toString()).toBe('5');
      expect(decision.tipAmount.toString()).toBe('0');
    }
  });

  it('non-cash asks for tip confirmation when there is an excess', () => {
    const decision = new TipOverpaymentPolicy().resolve(d('5.00'), false);
    expect(decision).toEqual({
      kind: 'NEEDS_TIP_CONFIRMATION',
      difference: d('5.00'),
    });
  });

  it('non-cash turns the excess into a tip once confirmed', () => {
    const decision = new TipOverpaymentPolicy().resolve(d('5.00'), true);
    expect(decision.kind).toBe('SETTLED');
    if (decision.kind === 'SETTLED') {
      expect(decision.changeAmount).toBeNull();
      expect(decision.tipAmount.toString()).toBe('5');
    }
  });

  it('non-cash with an exact payment settles without a tip', () => {
    const decision = new TipOverpaymentPolicy().resolve(d('0'), false);
    expect(decision.kind).toBe('SETTLED');
  });

  it('selects the policy by method code, case-insensitively', () => {
    expect(overpaymentPolicyFor('cash')).toBeInstanceOf(CashOverpaymentPolicy);
    expect(overpaymentPolicyFor('CASH')).toBeInstanceOf(CashOverpaymentPolicy);
  });

  it('falls back to the tip policy for any other or unknown code', () => {
    expect(overpaymentPolicyFor('CARD')).toBeInstanceOf(TipOverpaymentPolicy);
    expect(overpaymentPolicyFor('TRANSFER')).toBeInstanceOf(
      TipOverpaymentPolicy,
    );
    expect(overpaymentPolicyFor('QR')).toBeInstanceOf(TipOverpaymentPolicy);
  });
});
