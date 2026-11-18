export const ORDER_STATUSES = ['DRAFT', 'CLOSED', 'CANCELLED'] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
  DRAFT: ['CLOSED', 'CANCELLED'],
  CLOSED: ['CANCELLED'],
  CANCELLED: [],
};

export function canTransitionOrder(
  from: OrderStatusValue,
  to: OrderStatusValue,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function releasesTable(to: OrderStatusValue): boolean {
  return to === 'CLOSED' || to === 'CANCELLED';
}
