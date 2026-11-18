export const AUDIT_ACTION_GROUPS = [
  'items',
  'money',
  'status',
  'payments',
] as const;
export type AuditActionGroup = (typeof AUDIT_ACTION_GROUPS)[number];

const GROUPS: Record<AuditActionGroup, readonly string[]> = {
  items: ['ITEM_ADDED', 'ITEM_REMOVED', 'ITEM_QUANTITY_UPDATED'],
  money: ['DISCOUNT_APPLIED', 'TIP_ADDED'],
  status: ['CREATED', 'STATUS_CHANGED', 'KITCHEN_STATUS_CHANGED'],
  payments: ['PAYMENT'],
};

/** History actions that belong to an audit filter group (products, discounts/tips, status, payments). */
export function actionsOfGroup(group: AuditActionGroup): readonly string[] {
  return GROUPS[group];
}

export function groupOfAction(action: string): AuditActionGroup | null {
  for (const group of AUDIT_ACTION_GROUPS) {
    if (GROUPS[group].includes(action)) return group;
  }
  return null;
}

export interface ChangeSummary {
  changeCount: number;
  lastChangeAt: Date | null;
  lastChangeBy: string | null;
  users: { id: string; name: string; changes: number }[];
}

/** Folds the history rows of one order into the per-order audit summary. */
export function summarizeChanges(
  rows: readonly { userId: string; userName: string; createdAt: Date }[],
): ChangeSummary {
  const users = new Map<
    string,
    { id: string; name: string; changes: number }
  >();
  let last: { userName: string; createdAt: Date } | null = null;
  for (const row of rows) {
    const current = users.get(row.userId) ?? {
      id: row.userId,
      name: row.userName,
      changes: 0,
    };
    current.changes += 1;
    users.set(row.userId, current);
    if (!last || row.createdAt > last.createdAt) last = row;
  }
  return {
    changeCount: rows.length,
    lastChangeAt: last?.createdAt ?? null,
    lastChangeBy: last?.userName ?? null,
    users: [...users.values()].sort((a, b) => b.changes - a.changes),
  };
}
