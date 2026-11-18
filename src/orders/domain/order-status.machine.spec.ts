import {
  canTransitionOrder,
  ORDER_STATUSES,
  releasesTable,
} from './order-status.machine';

describe('order status machine', () => {
  const allowed = new Set([
    'DRAFT>CLOSED',
    'DRAFT>CANCELLED',
    'CLOSED>CANCELLED',
  ]);
  const cases = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.map(
      (to) => [from, to, allowed.has(`${from}>${to}`)] as const,
    ),
  );

  it.each(cases)('%s -> %s allowed=%s', (from, to, expected) => {
    expect(canTransitionOrder(from, to)).toBe(expected);
  });

  it('releases the table only on terminal states', () => {
    expect(releasesTable('DRAFT')).toBe(false);
    expect(releasesTable('CLOSED')).toBe(true);
    expect(releasesTable('CANCELLED')).toBe(true);
  });
});
