export interface MenuEntry {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface MenuMatch extends MenuEntry {
  score: number;
}

const STOP = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'con',
  'para',
]);

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(token: string): string {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function menuTokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token && !STOP.has(token))
    .map(singular);
}

export function searchMenu(
  entries: MenuEntry[],
  query: string,
  limit = 5,
): MenuMatch[] {
  const wanted = menuTokens(query);
  if (wanted.length === 0) return [];

  return entries
    .map((entry) => {
      const have = new Set(menuTokens(entry.name));
      const hits = wanted.filter(
        (token) =>
          have.has(token) ||
          [...have].some(
            (candidate) =>
              candidate.startsWith(token) || token.startsWith(candidate),
          ),
      ).length;
      const coverage = hits / wanted.length;
      const precision = have.size > 0 ? hits / have.size : 0;
      const score =
        Math.round((coverage * 0.75 + precision * 0.25) * 100) / 100;
      return { ...entry, score };
    })
    .filter((match) => match.score >= 0.5)
    .sort(
      (a, b) => b.score - a.score || Number(b.available) - Number(a.available),
    )
    .slice(0, limit);
}
