export const KITCHEN_STATUSES = ['PENDING', 'PREPARING', 'READY'] as const;
export type KitchenStatusValue = (typeof KITCHEN_STATUSES)[number];

const MANUAL_TRANSITIONS: Record<
  KitchenStatusValue,
  readonly KitchenStatusValue[]
> = {
  PENDING: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['PREPARING'],
};

export function canTransitionKitchen(
  from: KitchenStatusValue,
  to: KitchenStatusValue,
): boolean {
  return MANUAL_TRANSITIONS[from].includes(to);
}

export function kitchenStatusAfterItemAdded(
  current: KitchenStatusValue,
): KitchenStatusValue {
  return current === 'READY' ? 'PENDING' : current;
}
