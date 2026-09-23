import { Prisma } from '@prisma/client';
import {
  money,
  multiplyMoney,
  nonNegative,
  percentageOf,
  subtractMoney,
  sumMoney,
} from './money';

describe('money', () => {
  it('rounds to 2 decimals, half-up', () => {
    expect(money('2.005').toFixed(2)).toBe('2.01');
    expect(money(10.555).toFixed(2)).toBe('10.56');
  });

  it('multiplies unit price by quantity without float drift', () => {
    expect(multiplyMoney('10.50', 3).toFixed(2)).toBe('31.50');
    expect(multiplyMoney('0.10', 3).toFixed(2)).toBe('0.30');
  });

  it('sums decimals exactly (0.1 + 0.2 = 0.30, not 0.30000000000000004)', () => {
    expect(sumMoney(['0.10', '0.20']).toFixed(2)).toBe('0.30');
    expect(sumMoney(['19.99', '0.01']).toFixed(2)).toBe('20.00');
  });

  it('subtracts decimals', () => {
    expect(subtractMoney('100.00', '33.33').toFixed(2)).toBe('66.67');
  });

  it('applies percentage discounts', () => {
    expect(percentageOf('250.00', 10).toFixed(2)).toBe('25.00');
    expect(percentageOf('99.99', 15).toFixed(2)).toBe('15.00');
  });

  it('clamps negatives to zero', () => {
    expect(nonNegative(new Prisma.Decimal(-5)).toFixed(2)).toBe('0.00');
    expect(nonNegative(new Prisma.Decimal('3.5')).toFixed(2)).toBe('3.50');
  });
});
