import { allocatePayment } from './payment-allocation';

const run = (
  pendingBalance: string,
  amountReceived: string,
  methodCode: string,
  isExtraTip?: boolean,
) =>
  allocatePayment({ pendingBalance, amountReceived, methodCode, isExtraTip });

describe('allocatePayment', () => {
  it('rejects zero or negative pending balance', () => {
    expect(run('0', '10', 'CASH').kind).toBe('NO_PENDING_BALANCE');
    expect(run('-5', '10', 'CARD').kind).toBe('NO_PENDING_BALANCE');
  });

  it.each(['0', '-1', '0.004'])('rejects amount %s', (amount) => {
    expect(run('100', amount, 'CASH').kind).toBe('INVALID_AMOUNT');
  });

  it('cash overpayment produces change and closes', () => {
    const r = run('85.50', '100', 'cash');
    expect(r).toMatchObject({ kind: 'ALLOCATED', closesOrder: true });
    if (r.kind !== 'ALLOCATED') throw new Error();
    expect(r.changeAmount?.toString()).toBe('14.5');
    expect(r.amountApplied.toString()).toBe('85.5');
    expect(r.tipAmount.toString()).toBe('0');
  });

  it('exact cash has zero change', () => {
    const r = run('50', '50', 'CASH');
    if (r.kind !== 'ALLOCATED') throw new Error();
    expect(r.changeAmount?.toString()).toBe('0');
    expect(r.closesOrder).toBe(true);
  });

  it.each(['CARD', 'TRANSFER'])('%s excess needs confirmation', (code) => {
    const r = run('100', '110', code);
    expect(r.kind).toBe('NEEDS_TIP_CONFIRMATION');
    if (r.kind !== 'NEEDS_TIP_CONFIRMATION') throw new Error();
    expect(r.difference.toString()).toBe('10');
  });

  it('card excess confirmed as tip', () => {
    const r = run('100', '110', 'CARD', true);
    if (r.kind !== 'ALLOCATED') throw new Error();
    expect(r.tipAmount.toString()).toBe('10');
    expect(r.changeAmount).toBeNull();
    expect(r.closesOrder).toBe(true);
  });

  it('card exact amount with tip flag has no tip', () => {
    const r = run('100', '100', 'CARD', true);
    if (r.kind !== 'ALLOCATED') throw new Error();
    expect(r.tipAmount.toString()).toBe('0');
  });

  it('partial payment keeps the order open', () => {
    const r = run('100', '30.255', 'CASH', true);
    if (r.kind !== 'ALLOCATED') throw new Error();
    expect(r.amountApplied.toString()).toBe('30.26');
    expect(r.remainingBalance.toString()).toBe('69.74');
    expect(r.closesOrder).toBe(false);
    expect(r.changeAmount).toBeNull();
    expect(r.tipAmount.toString()).toBe('0');
  });
});
