export interface DateRange {
  from: string;
  to: string;
  label: string;
}

const DAY_MS = 86_400_000;

const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const WORD_NUMBERS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  quince: 15,
  veinte: 20,
  treinta: 30,
};

export function parseQuantityWord(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  return WORD_NUMBERS[normalize(token)] ?? null;
}

export interface ComparisonRanges {
  current: DateRange;
  previous: DateRange;
}

export function parseComparisonRanges(
  question: string,
  today: string,
): ComparisonRanges | null {
  const q = normalize(question);
  if (!/compar|\bvs\b|contra|respecto|frente a|versus/.test(q)) return null;
  const now = utc(today);
  const date = new Date(now);

  if (/mes (pasado|anterior)/.test(q)) {
    const firstThis = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const firstPrev = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() - 1,
      1,
    );
    const lastPrev = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0);
    const elapsed = Math.round((now - firstThis) / DAY_MS);
    const previousTo = Math.min(firstPrev + elapsed * DAY_MS, lastPrev);
    return {
      current: { from: fmt(firstThis), to: today, label: 'este mes' },
      previous: {
        from: fmt(firstPrev),
        to: fmt(previousTo),
        label: 'el mes pasado',
      },
    };
  }
  if (/semana (pasada|anterior)/.test(q)) {
    const monday = now - ((date.getUTCDay() + 6) % 7) * DAY_MS;
    const elapsed = Math.round((now - monday) / DAY_MS);
    const prevMonday = monday - 7 * DAY_MS;
    return {
      current: { from: fmt(monday), to: today, label: 'esta semana' },
      previous: {
        from: fmt(prevMonday),
        to: fmt(prevMonday + elapsed * DAY_MS),
        label: 'la semana pasada',
      },
    };
  }
  if (/\bayer\b/.test(q) && /\bhoy\b/.test(q)) {
    const yesterday = fmt(now - DAY_MS);
    return {
      current: { from: today, to: today, label: 'hoy' },
      previous: { from: yesterday, to: yesterday, label: 'ayer' },
    };
  }
  return null;
}

export function parseQuestionRange(question: string, today: string): DateRange {
  const q = normalize(question);
  const now = utc(today);
  const weekday = new Date(now).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const monday = now - mondayOffset * DAY_MS;

  const comparison = parseComparisonRanges(question, today);
  if (comparison) return comparison.current;

  const last =
    /ultim[oa]s?\s+(\d{1,3}|un|una|dos|tres|cuatro|cinco|siete|diez|quince|veinte|treinta)\s+(dia|dias|semana|semanas|mes|meses)/.exec(
      q,
    );
  if (last) {
    const amount = parseQuantityWord(last[1]) ?? 7;
    const unit = last[2];
    const days = unit.startsWith('dia')
      ? amount
      : unit.startsWith('semana')
        ? amount * 7
        : amount * 30;
    return {
      from: fmt(now - (days - 1) * DAY_MS),
      to: today,
      label: `últimos ${days} días`,
    };
  }
  if (/anteayer|antier/.test(q)) {
    const d = fmt(now - 2 * DAY_MS);
    return { from: d, to: d, label: 'anteayer' };
  }
  if (/\bayer\b/.test(q)) {
    const d = fmt(now - DAY_MS);
    return { from: d, to: d, label: 'ayer' };
  }
  if (/\bhoy\b/.test(q)) return { from: today, to: today, label: 'hoy' };
  if (/semana (pasada|anterior)/.test(q)) {
    return {
      from: fmt(monday - 7 * DAY_MS),
      to: fmt(monday - DAY_MS),
      label: 'la semana pasada',
    };
  }
  if (/(esta|actual) semana|semana en curso/.test(q)) {
    return { from: fmt(monday), to: today, label: 'esta semana' };
  }
  const first = new Date(now);
  first.setUTCDate(1);
  if (/mes (pasado|anterior)/.test(q)) {
    const end = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 0);
    const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1);
    return { from: fmt(start), to: fmt(end), label: 'el mes pasado' };
  }
  if (/(este|actual) mes|mes en curso/.test(q)) {
    return { from: fmt(first.getTime()), to: today, label: 'este mes' };
  }
  if (/(este|ultimo) ano|\ban[oa]\b/.test(q) && /este ano|ano actual/.test(q)) {
    return { from: `${today.slice(0, 4)}-01-01`, to: today, label: 'este año' };
  }
  return {
    from: fmt(now - 29 * DAY_MS),
    to: today,
    label: 'los últimos 30 días',
  };
}
