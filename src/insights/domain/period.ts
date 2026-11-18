const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) throw new RangeError(`Invalid date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function periodLengthDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;
}

export function previousPeriod(from: string, to: string) {
  const days = periodLengthDays(from, to);
  const previousTo = toUtc(from) - DAY_MS;
  return {
    from: format(previousTo - (days - 1) * DAY_MS),
    to: format(previousTo),
  };
}

export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
