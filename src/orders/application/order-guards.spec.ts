import { ConflictException, ForbiddenException } from '@nestjs/common';
import { makeOrder } from './testing/fakes';
import { assertEditable } from './order-guards';

describe('assertEditable (basis path, V(G)=3)', () => {
  it('C1: rejects an order that is not DRAFT', () => {
    const order = makeOrder({ status: 'CLOSED', paymentCount: 0 });
    expect(() => assertEditable(order, 'agregar items a')).toThrow(
      ForbiddenException,
    );
  });

  it('C2: rejects a DRAFT order that already has payments', () => {
    const order = makeOrder({ status: 'DRAFT', paymentCount: 1 });
    expect(() => assertEditable(order, 'agregar items a')).toThrow(
      ConflictException,
    );
  });

  it('C3: accepts a DRAFT order without payments', () => {
    const order = makeOrder({ status: 'DRAFT', paymentCount: 0 });
    expect(() => assertEditable(order, 'agregar items a')).not.toThrow();
  });
});
