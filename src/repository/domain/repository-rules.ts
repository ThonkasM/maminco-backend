export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_NAME_LENGTH = 120;
export const MAX_FILES_PER_UPLOAD = 10;
export const TRASH_RETENTION_DAYS = 30;

type Magic = 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'zip' | 'text';

interface AllowedType {
  mime: string;
  /** Other content types browsers commonly declare for this extension. */
  alternates: string[];
  magic: Magic;
}

const OFFICE = (mime: string): AllowedType => ({
  mime,
  alternates: [],
  magic: 'zip',
});

export const ALLOWED_TYPES: Record<string, AllowedType> = {
  pdf: { mime: 'application/pdf', alternates: [], magic: 'pdf' },
  docx: OFFICE(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ),
  xlsx: OFFICE(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ),
  pptx: OFFICE(
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ),
  csv: {
    mime: 'text/csv',
    alternates: ['application/vnd.ms-excel', 'application/csv', 'text/plain'],
    magic: 'text',
  },
  txt: { mime: 'text/plain', alternates: [], magic: 'text' },
  png: { mime: 'image/png', alternates: [], magic: 'png' },
  jpg: { mime: 'image/jpeg', alternates: [], magic: 'jpeg' },
  jpeg: { mime: 'image/jpeg', alternates: [], magic: 'jpeg' },
  webp: { mime: 'image/webp', alternates: [], magic: 'webp' },
  gif: { mime: 'image/gif', alternates: [], magic: 'gif' },
  zip: {
    mime: 'application/zip',
    alternates: ['application/x-zip-compressed'],
    magic: 'zip',
  },
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Removes path separators, control characters and leading dots; never returns an empty name. */
export function sanitizeName(raw: string): string {
  let name = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '-')
    .replace(/\.{2,}/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  if (name.length > MAX_NAME_LENGTH) {
    const ext = extensionOf(name);
    const suffix = ext ? `.${ext}` : '';
    name = name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
  }
  return name;
}

/** "informe.pdf" -> "informe (2).pdf" when the name is taken (case-insensitive). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((item) => item.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const ext = extensionOf(name);
  const base = ext ? name.slice(0, name.length - ext.length - 1) : name;
  for (let n = 2; n < 10_000; n++) {
    const candidate = ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext ? `.${ext}` : ''}`;
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function matchesMagic(magic: Magic, buffer: Buffer): boolean {
  switch (magic) {
    case 'pdf':
      return startsWith(buffer, [0x25, 0x50, 0x44, 0x46]);
    case 'png':
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47]);
    case 'jpeg':
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case 'gif':
      return startsWith(buffer, [0x47, 0x49, 0x46, 0x38]);
    case 'webp':
      return (
        startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
      );
    case 'zip':
      return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);
    case 'text':
      return !buffer.subarray(0, 8192).includes(0);
  }
}

export type UploadCheck =
  { ok: true; mime: string } | { ok: false; reason: string };

/** Validates an upload by extension, declared content type and the file's first bytes. */
export function checkUpload(
  name: string,
  declaredMime: string | undefined,
  buffer: Buffer,
): UploadCheck {
  const allowed = ALLOWED_TYPES[extensionOf(name)];
  if (!allowed) {
    return {
      ok: false,
      reason: `Tipo de archivo no permitido: ${name}. Usa PDF, Office, CSV, TXT, imágenes o ZIP.`,
    };
  }
  const declared = (declaredMime ?? '').split(';')[0].trim().toLowerCase();
  const accepted = [
    allowed.mime,
    ...allowed.alternates,
    'application/octet-stream',
    '',
  ];
  if (!accepted.includes(declared)) {
    return {
      ok: false,
      reason: `El contenido de ${name} no coincide con su extensión.`,
    };
  }
  if (buffer.length === 0) {
    return { ok: false, reason: `${name} está vacío.` };
  }
  if (!matchesMagic(allowed.magic, buffer)) {
    return {
      ok: false,
      reason: `El contenido de ${name} no coincide con su extensión.`,
    };
  }
  return { ok: true, mime: allowed.mime };
}

/** PDFs and images open in the browser; everything else downloads. */
export function isInlineType(mime: string): boolean {
  return mime === 'application/pdf' || mime.startsWith('image/');
}

/** True when moving `movingId` under `newParentId` would put a folder inside itself. */
export function createsCycle(
  movingId: string,
  newParentId: string | null,
  parentOf: (id: string) => string | null,
): boolean {
  let current = newParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === movingId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = parentOf(current);
  }
  return false;
}
