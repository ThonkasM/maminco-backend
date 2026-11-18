import {
  checkUpload,
  createsCycle,
  sanitizeName,
  uniqueName,
} from './repository-rules';

const pdf = Buffer.from('%PDF-1.4 test');
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);

describe('sanitizeName', () => {
  it('removes separators, traversal and leading dots', () => {
    expect(sanitizeName('../../etc/passwd')).toBe('-etc-passwd');
    expect(sanitizeName('a\\b/c.pdf')).toBe('a-b-c.pdf');
    expect(sanitizeName('..hidden')).toBe('hidden');
    expect(sanitizeName('  \u0000x\u0007y  ')).toBe('xy');
  });

  it('can end up empty so callers must reject it', () => {
    expect(sanitizeName('...')).toBe('');
  });

  it('truncates long names keeping the extension', () => {
    const name = sanitizeName(`${'a'.repeat(300)}.pdf`);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('uniqueName', () => {
  it('keeps free names', () => {
    expect(uniqueName('a.pdf', ['b.pdf'])).toBe('a.pdf');
  });

  it('adds a numeric suffix before the extension, case-insensitively', () => {
    expect(uniqueName('Informe.pdf', ['informe.PDF'])).toBe('Informe (2).pdf');
    expect(uniqueName('Informe.pdf', ['informe.pdf', 'Informe (2).pdf'])).toBe(
      'Informe (3).pdf',
    );
  });

  it('handles names without extension', () => {
    expect(uniqueName('Notas', ['Notas'])).toBe('Notas (2)');
  });
});

describe('checkUpload', () => {
  it('accepts a real pdf', () => {
    expect(checkUpload('a.pdf', 'application/pdf', pdf)).toEqual({
      ok: true,
      mime: 'application/pdf',
    });
  });

  it('accepts generic octet-stream when the bytes match', () => {
    expect(checkUpload('a.pdf', 'application/octet-stream', pdf).ok).toBe(true);
  });

  it('rejects extensions outside the allowlist', () => {
    expect(checkUpload('virus.exe', 'application/octet-stream', pdf).ok).toBe(
      false,
    );
    expect(checkUpload('page.html', 'text/html', pdf).ok).toBe(false);
    expect(checkUpload('noext', '', pdf).ok).toBe(false);
  });

  it('rejects content that does not match the extension', () => {
    expect(
      checkUpload('a.pdf', 'application/pdf', Buffer.from('MZ binary')).ok,
    ).toBe(false);
    expect(checkUpload('a.png', 'image/png', pdf).ok).toBe(false);
  });

  it('rejects a mismatched declared type', () => {
    expect(checkUpload('a.pdf', 'image/png', pdf).ok).toBe(false);
  });

  it('accepts office and zip containers by their signature', () => {
    expect(checkUpload('a.xlsx', 'application/zip', zip).ok).toBe(false);
    expect(
      checkUpload(
        'a.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        zip,
      ).ok,
    ).toBe(true);
    expect(checkUpload('a.zip', 'application/x-zip-compressed', zip).ok).toBe(
      true,
    );
  });

  it('rejects binary content disguised as text', () => {
    expect(checkUpload('a.csv', 'text/csv', Buffer.from([1, 2, 0, 3])).ok).toBe(
      false,
    );
    expect(checkUpload('a.csv', 'text/csv', Buffer.from('a,b\n1,2')).ok).toBe(
      true,
    );
  });

  it('rejects empty files', () => {
    expect(checkUpload('a.txt', 'text/plain', Buffer.alloc(0)).ok).toBe(false);
  });
});

describe('createsCycle', () => {
  const parents: Record<string, string | null> = { c: 'b', b: 'a', a: null };
  const parentOf = (id: string) => parents[id] ?? null;

  it('detects moving a folder into itself or a descendant', () => {
    expect(createsCycle('a', 'a', parentOf)).toBe(true);
    expect(createsCycle('a', 'c', parentOf)).toBe(true);
  });

  it('allows moving to unrelated folders and to the root', () => {
    expect(createsCycle('c', 'a', parentOf)).toBe(false);
    expect(createsCycle('c', null, parentOf)).toBe(false);
  });
});
