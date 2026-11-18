import {
  calculateDiscount,
  calculateSubtotal,
  calculateTotal,
  formatOrderNumber,
  isFullyPaid,
  pendingBalance,
} from './order-totals';

describe('order-totals', () => {
  it.each([
    [[], '0'],
    [[{ unitPrice: '10.00', quantity: 2 }], '20'],
    [[{ unitPrice: '0.10', quantity: 3 }], '0.3'],
    [
      [
        { unitPrice: '33.335', quantity: 1 },
        { unitPrice: '1', quantity: 1, discountAmount: '0.5' },
      ],
      '33.84',
    ],
  ])('subtotal of %j is %s', (lines, expected) => {
    expect(calculateSubtotal(lines as never).toString()).toBe(expected);
  });

  it.each([
    ['100', '10', '5', '95'],
    ['100', '0', '0', '100'],
    ['100', '150', '0', '0'],
    ['10.005', '0', '0', '10.01'],
  ])('total(%s - %s + %s) = %s', (subtotal, discount, tip, expected) => {
    expect(calculateTotal(subtotal, discount, tip).toString()).toBe(expected);
  });

  it.each([
    [{}, 'MISSING'],
    [{ percentage: 10, fixed: 5 }, 'BOTH'],
    [{ percentage: 101 }, 'PERCENT_RANGE'],
    [{ fixed: -1 }, 'NEGATIVE'],
    [{ fixed: 200 }, 'EXCEEDS'],
  ])('discount %j is rejected as %s', (input, reason) => {
    expect(calculateDiscount('100', input)).toEqual({ ok: false, reason });
  });

  it('computes percentage and fixed discounts with half-up rounding', () => {
    const pct = calculateDiscount('33.33', { percentage: 15 });
    expect(pct.ok && pct.amount.toString()).toBe('5');
    const fixed = calculateDiscount('100', { fixed: 12.345 });
    expect(fixed.ok && fixed.amount.toString()).toBe('12.35');
  });

  it('computes pending balance and fully-paid flag', () => {
    expect(pendingBalance('100', '40').toString()).toBe('60');
    expect(pendingBalance('100', '120').toString()).toBe('-20');
    expect(isFullyPaid('100', '100')).toBe(true);
    expect(isFullyPaid('100', '99.99')).toBe(false);
    expect(isFullyPaid('0', '0')).toBe(true);
  });

  it('formats order numbers', () => {
    expect(formatOrderNumber(7)).toBe('000007');
    expect(formatOrderNumber(BigInt(1234567))).toBe('1234567');
  });
});
