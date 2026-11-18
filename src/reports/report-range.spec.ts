import {
  addDays,
  buildUtcRange,
  startOfDayUtc,
  todayInZone,
} from './report-range';

describe('report-range', () => {
  it('converts La Paz midnight (UTC-4) to UTC', () => {
    expect(startOfDayUtc('2026-10-29', 'America/La_Paz').toISOString()).toBe(
      '2026-10-29T04:00:00.000Z',
    );
  });

  it('handles UTC and positive offsets', () => {
    expect(startOfDayUtc('2026-10-29', 'UTC').toISOString()).toBe(
      '2026-10-29T00:00:00.000Z',
    );
    expect(startOfDayUtc('2026-10-29', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-28T18:30:00.000Z',
    );
  });

  it('respects daylight saving offsets', () => {
    expect(startOfDayUtc('2026-07-01', 'America/New_York').toISOString()).toBe(
      '2026-07-01T04:00:00.000Z',
    );
    expect(startOfDayUtc('2026-01-01', 'America/New_York').toISOString()).toBe(
      '2026-01-01T05:00:00.000Z',
    );
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('builds an inclusive-from, exclusive-to range of whole days', () => {
    const { start, end } = buildUtcRange(
      '2026-10-01',
      '2026-10-02',
      'America/La_Paz',
    );
    expect(start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-03T04:00:00.000Z');
  });

  it('accepts ISO datetimes by using the date part', () => {
    expect(startOfDayUtc('2026-10-29T15:00:00Z', 'UTC').toISOString()).toBe(
      '2026-10-29T00:00:00.000Z',
    );
  });

  it('rejects invalid dates', () => {
    expect(() => startOfDayUtc('nope', 'UTC')).toThrow(RangeError);
  });

  it('computes today in the given zone', () => {
    const now = new Date('2026-10-29T02:00:00Z');
    expect(todayInZone('America/La_Paz', now)).toBe('2026-10-28');
    expect(todayInZone('UTC', now)).toBe('2026-10-29');
  });
});
