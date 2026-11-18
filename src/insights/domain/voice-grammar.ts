import { normalizeText } from './menu-match';
import { parseQuantityWord } from './question-range';

export type VoiceOpKind =
  'open' | 'add' | 'set' | 'remove' | 'increase' | 'decrease';

export interface VoiceOp {
  op: VoiceOpKind;
  quantity: number | null;
  name: string;
}

export interface VoiceCommand {
  table: number | null;
  ops: VoiceOp[];
}

const VERBS: [VoiceOpKind, RegExp][] = [
  [
    'remove',
    /^(quita|quitar|quitame|saca|sacar|elimina|eliminar|borra|borrar|retira|retirar)\b/,
  ],
  [
    'decrease',
    /^(baja|bajar|reduce|reducir|resta|restar|disminuye|disminuir)\b/,
  ],
  ['increase', /^(aumenta|aumentar|sube|subir|incrementa|incrementar)\b/],
  [
    'set',
    /^(cambia|cambiar|deja|dejar|actualiza|actualizar|modifica|modificar|corrige|corregir)\b/,
  ],
  [
    'add',
    /^(agrega|agregar|agregale|anade|anadir|coloca|colocar|pon|poner|ponle|anota|anotar|suma|sumar|registra|registrar|pide|pedir|apunta|apuntar)\b/,
  ],
];

const FILLER = /\b(por favor|porfa|ahi|tambien|ademas|luego|despues)\b/g;
const ARTICLES = new Set([
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
  'a',
  'al',
  'en',
  'mas',
  'otro',
  'otra',
  'otros',
  'otras',
  'orden',
  'pedido',
  'cuenta',
]);

function extractQuantity(tokens: string[]): {
  quantity: number | null;
  rest: string[];
} {
  const index = tokens.findIndex((token) => parseQuantityWord(token) !== null);
  if (index === -1) return { quantity: null, rest: tokens };
  const quantity = parseQuantityWord(tokens[index]);
  return { quantity, rest: tokens.filter((_, i) => i !== index) };
}

export function parseVoiceCommand(transcript: string): VoiceCommand {
  let text = normalizeText(transcript)
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tableMatch = /\bmesa\s*(?:numero|nro|n)?\s*(\d{1,3}|[a-z]+)\b/.exec(
    text,
  );
  let table: number | null = null;
  if (tableMatch) {
    table = parseQuantityWord(tableMatch[1]);
  }

  const ops: VoiceOp[] = [];
  const opening =
    /\b(abre|abrir|abri|inicia|iniciar|crea|crear|nueva orden)\b[^]*?\bmesa\b|\bmesa\b[^]*?\b(abierta|nueva orden)\b/.test(
      text,
    );
  if (opening) {
    ops.push({ op: 'open', quantity: null, name: '' });
  }

  if (tableMatch) {
    text = text.replace(
      /\b(abre|abrir|abri|inicia|iniciar|crea|crear)?\s*(la\s+)?mesa\s*(?:numero|nro|n)?\s*(\d{1,3}|[a-z]+)\b/,
      ' ',
    );
  }

  const clauses = text
    .split(/\s+y\s+|,|;/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  let lastOp: VoiceOpKind = 'add';
  for (const clause of clauses) {
    let tokens = clause.split(' ').filter(Boolean);
    let op: VoiceOpKind | null = null;
    for (const [kind, pattern] of VERBS) {
      if (pattern.test(clause)) {
        op = kind;
        tokens = tokens.slice(1);
        break;
      }
    }
    if (!op) op = lastOp === 'open' ? 'add' : lastOp;

    let target: number | null = null;
    if (op === 'set') {
      const at = tokens.findIndex(
        (token, i) =>
          (token === 'a' || token === 'en') &&
          parseQuantityWord(tokens[i + 1] ?? '') !== null,
      );
      if (at !== -1) {
        target = parseQuantityWord(tokens[at + 1]);
        tokens = [...tokens.slice(0, at), ...tokens.slice(at + 2)];
      }
    }

    const { quantity, rest } = extractQuantity(tokens);
    const name = rest
      .filter((token) => !ARTICLES.has(token))
      .join(' ')
      .trim();
    if (!name) {
      lastOp = op;
      continue;
    }
    ops.push({
      op,
      quantity: op === 'set' ? (target ?? quantity) : quantity,
      name,
    });
    lastOp = op;
  }

  return { table, ops };
}
