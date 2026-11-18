import {
  actionsOfGroup,
  groupOfAction,
  summarizeChanges,
} from './audit-actions';

describe('audit actions', () => {
  it('maps groups to history actions and back', () => {
    expect(actionsOfGroup('items')).toContain('ITEM_REMOVED');
    expect(actionsOfGroup('payments')).toEqual(['PAYMENT']);
    expect(groupOfAction('TIP_ADDED')).toBe('money');
    expect(groupOfAction('UNKNOWN')).toBeNull();
  });

  it('summarizes who changed an order and how much', () => {
    const summary = summarizeChanges([
      {
        userId: 'a',
        userName: 'Ana',
        createdAt: new Date('2026-11-17T10:00:00Z'),
      },
      {
        userId: 'b',
        userName: 'Beto',
        createdAt: new Date('2026-11-17T10:05:00Z'),
      },
      {
        userId: 'a',
        userName: 'Ana',
        createdAt: new Date('2026-11-17T10:09:00Z'),
      },
    ]);
    expect(summary.changeCount).toBe(3);
    expect(summary.lastChangeBy).toBe('Ana');
    expect(summary.users).toEqual([
      { id: 'a', name: 'Ana', changes: 2 },
      { id: 'b', name: 'Beto', changes: 1 },
    ]);
  });

  it('handles orders without history', () => {
    expect(summarizeChanges([])).toEqual({
      changeCount: 0,
      lastChangeAt: null,
      lastChangeBy: null,
      users: [],
    });
  });
});
