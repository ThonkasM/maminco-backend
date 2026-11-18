import { searchMenu, type MenuEntry } from './menu-match';
import {
  parseComparisonRanges,
  parseQuantityWord,
  parseQuestionRange,
} from './question-range';

const menu: MenuEntry[] = [
  { id: '1', name: 'PATO CRIOLLO', price: 250, available: true },
  { id: '2', name: 'PATO MANDARÍN', price: 250, available: true },
  { id: '3', name: 'GASEOSA', price: 12, available: true },
  { id: '4', name: 'GASEOSA FAMILIAR', price: 25, available: true },
  { id: '5', name: 'JARRA LIMONADA', price: 30, available: true },
];

describe('menu matching', () => {
  it('matches plurals and accents', () => {
    expect(searchMenu(menu, 'patos criollos')[0].id).toBe('1');
    expect(searchMenu(menu, 'pato mandarin')[0].id).toBe('2');
  });

  it('prefers the more specific item', () => {
    expect(searchMenu(menu, 'gaseosa familiar')[0].id).toBe('4');
    expect(searchMenu(menu, 'gaseosa')[0].id).toBe('3');
  });

  it('returns nothing for unknown dishes', () => {
    expect(searchMenu(menu, 'pizza hawaiana')).toEqual([]);
  });
});

describe('comparison ranges', () => {
  const today = '2026-11-18';

  it('compares this month so far with the same stretch of last month', () => {
    const result = parseComparisonRanges(
      'Compara este mes con el mes pasado',
      today,
    );
    expect(result?.current).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-18',
    });
    expect(result?.previous).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-18',
    });
  });

  it('caps the previous month at its last day', () => {
    const result = parseComparisonRanges(
      'compara con el mes pasado',
      '2026-03-31',
    );
    expect(result?.previous.to).toBe('2026-02-28');
  });

  it('compares the week so far and today with yesterday', () => {
    expect(
      parseComparisonRanges('esta semana vs la semana pasada', today)?.previous,
    ).toMatchObject({
      from: '2026-11-09',
      to: '2026-11-11',
    });
    expect(
      parseComparisonRanges('compara hoy con ayer', today)?.previous.from,
    ).toBe('2026-11-17');
  });

  it('returns null without a comparison intent', () => {
    expect(parseComparisonRanges('ventas del mes pasado', today)).toBeNull();
  });
});

describe('question range', () => {
  const today = '2026-11-18';

  it.each([
    ['ventas de hoy', '2026-11-18', '2026-11-18'],
    ['cómo estuvo ayer', '2026-11-17', '2026-11-17'],
    ['ventas de esta semana', '2026-11-16', '2026-11-18'],
    ['la semana pasada', '2026-11-09', '2026-11-15'],
    ['este mes', '2026-11-01', '2026-11-18'],
    ['el mes pasado', '2026-10-01', '2026-10-31'],
    ['últimos 7 días', '2026-11-12', '2026-11-18'],
    ['últimas dos semanas', '2026-11-05', '2026-11-18'],
  ])('%s', (question, from, to) => {
    const range = parseQuestionRange(question, today);
    expect([range.from, range.to]).toEqual([from, to]);
  });

  it('defaults to the last 30 days and parses quantity words', () => {
    expect(parseQuestionRange('cuál es el top', today).from).toBe('2026-10-20');
    expect(parseQuantityWord('dos')).toBe(2);
    expect(parseQuantityWord('12')).toBe(12);
    expect(parseQuantityWord('mesa')).toBeNull();
  });
});

import { parseVoiceCommand } from './voice-grammar';

describe('voice grammar', () => {
  it('parses the headline example', () => {
    const command = parseVoiceCommand(
      'Abre la mesa 40 y coloca 2 patos criollos y 1 gaseosa familiar',
    );
    expect(command.table).toBe(40);
    expect(command.ops).toEqual([
      { op: 'open', quantity: null, name: '' },
      { op: 'add', quantity: 2, name: 'patos criollos' },
      { op: 'add', quantity: 1, name: 'gaseosa familiar' },
    ]);
  });

  it('understands spoken numbers and implicit add', () => {
    const command = parseVoiceCommand('mesa cinco agrega dos jarras limonada');
    expect(command.table).toBe(5);
    expect(command.ops).toEqual([
      { op: 'add', quantity: 2, name: 'jarras limonada' },
    ]);
  });

  it('parses remove, increase, decrease and set', () => {
    expect(
      parseVoiceCommand('quita el pato mandarín de la mesa 3').ops[0],
    ).toMatchObject({
      op: 'remove',
      name: 'pato mandarin',
    });
    expect(
      parseVoiceCommand('aumenta 2 gaseosas en la mesa 3').ops[0],
    ).toMatchObject({
      op: 'increase',
      quantity: 2,
      name: 'gaseosas',
    });
    expect(parseVoiceCommand('baja una gaseosa mesa 3').ops[0]).toMatchObject({
      op: 'decrease',
      quantity: 1,
    });
    expect(
      parseVoiceCommand('cambia los patos criollos a 4 en la mesa 3').ops[0],
    ).toMatchObject({
      op: 'set',
      quantity: 4,
      name: 'patos criollos',
    });
  });

  it('returns no table when it is not spoken', () => {
    expect(parseVoiceCommand('agrega una gaseosa').table).toBeNull();
  });
});
