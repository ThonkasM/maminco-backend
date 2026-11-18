export const MINUTES_PER_DAY = 1440;

export interface ShiftWindow {
  name: string;
  startMinute: number;
  endMinute: number;
}

export function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function formatMinutes(minutes: number): string {
  const safe =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Minutes covered by a shift; a shift with end <= start crosses midnight (equal bounds = the whole day). */
export function shiftLength(shift: ShiftWindow): number {
  const length =
    (shift.endMinute - shift.startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return length === 0 ? MINUTES_PER_DAY : length;
}

export function shiftContains(shift: ShiftWindow, minute: number): boolean {
  const offset =
    (minute - shift.startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return offset < shiftLength(shift);
}

export function shiftOfMinute<T extends ShiftWindow>(
  shifts: readonly T[],
  minute: number,
): T | undefined {
  return shifts.find((shift) => shiftContains(shift, minute));
}

/** Returns a list of human readable problems; empty means the configuration is valid. */
export function validateShifts(shifts: readonly ShiftWindow[]): string[] {
  const errors: string[] = [];
  if (shifts.length === 0) return ['Define al menos un turno.'];

  const names = new Set<string>();
  for (const shift of shifts) {
    const name = shift.name.trim();
    if (!name) errors.push('Todos los turnos necesitan un nombre.');
    else if (names.has(name.toLowerCase())) {
      errors.push(`El nombre "${name}" está repetido.`);
    }
    names.add(name.toLowerCase());
  }

  const coverage = new Array<number>(MINUTES_PER_DAY).fill(0);
  for (const shift of shifts) {
    const length = shiftLength(shift);
    for (let i = 0; i < length; i++) {
      coverage[(shift.startMinute + i) % MINUTES_PER_DAY] += 1;
    }
  }
  if (coverage.some((count) => count > 1)) {
    errors.push('Los turnos no pueden solaparse.');
  }
  if (coverage.some((count) => count === 0)) {
    errors.push('Los turnos deben cubrir las 24 horas del día sin huecos.');
  }
  return errors;
}

/** Business date (YYYY-MM-DD) of an instant: local time minus the business day start. */
export function businessDateOf(
  instant: Date,
  timeZone: string,
  startMinute: number,
): string {
  const shifted = new Date(instant.getTime() - startMinute * 60_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
}
