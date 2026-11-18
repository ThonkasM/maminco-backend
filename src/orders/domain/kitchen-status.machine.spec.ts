import {
  canTransitionKitchen,
  KITCHEN_STATUSES,
  kitchenStatusAfterItemAdded,
} from './kitchen-status.machine';

describe('kitchen status machine', () => {
  const allowed = new Set([
    'PENDING>PREPARING',
    'PREPARING>READY',
    'READY>PREPARING',
  ]);
  const cases = KITCHEN_STATUSES.flatMap((from) =>
    KITCHEN_STATUSES.map(
      (to) => [from, to, allowed.has(`${from}>${to}`)] as const,
    ),
  );

  it.each(cases)('%s -> %s allowed=%s', (from, to, expected) => {
    expect(canTransitionKitchen(from, to)).toBe(expected);
  });

  it.each([
    ['PENDING', 'PENDING'],
    ['PREPARING', 'PREPARING'],
    ['READY', 'PENDING'],
  ] as const)('adding an item to %s leaves %s', (current, expected) => {
    expect(kitchenStatusAfterItemAdded(current)).toBe(expected);
  });
});
