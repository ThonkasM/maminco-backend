export interface UtcRange {
  start: Date;
  end: Date;
}

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function startOfDayUtc(date: string, timeZone: string): Date {
  const match = DATE_PREFIX.exec(date);
  if (!match) throw new RangeError(`Invalid date: ${date}`);
  const localMidnight = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  let instant = localMidnight - offsetMs(localMidnight, timeZone);
  instant = localMidnight - offsetMs(instant, timeZone);
  return new Date(instant);
}

export function addDays(date: string, days: number): string {
  const match = DATE_PREFIX.exec(date);
  if (!match) throw new RangeError(`Invalid date: ${date}`);
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return shifted.toISOString().slice(0, 10);
}

export function buildUtcRange(
  from: string,
  to: string,
  timeZone: string,
): UtcRange {
  return {
    start: startOfDayUtc(from, timeZone),
    end: startOfDayUtc(addDays(to, 1), timeZone),
  };
}

export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
