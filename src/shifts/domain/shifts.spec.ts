import {
  businessDateOf,
  formatMinutes,
  parseTime,
  shiftOfMinute,
  validateShifts,
} from './shifts';

const day = { name: 'Día', startMinute: 360, endMinute: 1080 };
const night = { name: 'Noche', startMinute: 1080, endMinute: 360 };

describe('shift helpers', () => {
  it('converts between HH:MM and minutes', () => {
    expect(parseTime('18:30')).toBe(1110);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('6:00')).toBeNull();
    expect(formatMinutes(1110)).toBe('18:30');
    expect(formatMinutes(1440)).toBe('00:00');
  });

  it('accepts day/night shifts that cover 24 hours', () => {
    expect(validateShifts([day, night])).toEqual([]);
  });

  it('accepts a single shift that spans the whole day', () => {
    expect(
      validateShifts([{ name: 'Todo el día', startMinute: 0, endMinute: 0 }]),
    ).toEqual([]);
  });

  it('rejects gaps, overlaps, duplicates and empty lists', () => {
    expect(validateShifts([])).toHaveLength(1);
    expect(
      validateShifts([day, { ...night, startMinute: 1140 }]).join(' '),
    ).toContain('huecos');
    expect(
      validateShifts([day, { ...night, startMinute: 1000 }]).join(' '),
    ).toContain('solaparse');
    expect(
      validateShifts([day, { ...night, name: ' día ' }]).join(' '),
    ).toContain('repetido');
    expect(validateShifts([{ ...day, name: ' ' }, night]).join(' ')).toContain(
      'nombre',
    );
  });

  it('finds the shift of a minute, including across midnight', () => {
    const shifts = [day, night];
    expect(shiftOfMinute(shifts, 12 * 60)?.name).toBe('Día');
    expect(shiftOfMinute(shifts, 23 * 60)?.name).toBe('Noche');
    expect(shiftOfMinute(shifts, 2 * 60)?.name).toBe('Noche');
    expect(shiftOfMinute(shifts, 360)?.name).toBe('Día');
    expect(shiftOfMinute(shifts, 1080)?.name).toBe('Noche');
  });

  it('assigns early-morning sales to the previous business day', () => {
    // 2026-11-18 01:30 in La Paz (UTC-4) = 05:30 UTC
    const instant = new Date('2026-11-18T05:30:00Z');
    expect(businessDateOf(instant, 'America/La_Paz', 0)).toBe('2026-11-18');
    expect(businessDateOf(instant, 'America/La_Paz', 360)).toBe('2026-11-17');
    expect(
      businessDateOf(new Date('2026-11-18T10:30:00Z'), 'America/La_Paz', 360),
    ).toBe('2026-11-18');
  });
});
