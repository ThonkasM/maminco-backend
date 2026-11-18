import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { ObjectStorage } from '../media/application/ports/object-storage.port';
import type { PrismaService } from '../prisma/prisma.service';
import { RepositoryService } from './repository.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_4AM: '0 4 * * *' },
}));

interface Row {
  id: string;
  name: string;
  kind: 'FOLDER' | 'FILE';
  parentId: string | null;
  system: boolean;
  storageKey: string | null;
  mimeType: string | null;
  size: number | null;
  deletedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function row(partial: Partial<Row> & Pick<Row, 'id' | 'name' | 'kind'>): Row {
  return {
    parentId: null,
    system: false,
    storageKey: null,
    mimeType: null,
    size: null,
    deletedAt: null,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

/** Minimal in-memory stand-in for the repositoryNode delegate. */
function build(initial: Row[]) {
  const rows = [...initial];
  let counter = 100;
  const matches = (item: Row, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR')
        return (value as Record<string, unknown>[]).some((w) =>
          matches(item, w),
        );
      if (key === 'parent') return true;
      const actual = (item as unknown as Record<string, unknown>)[key];
      if (value && typeof value === 'object' && 'in' in value) {
        return (value as { in: unknown[] }).in.includes(actual);
      }
      if (value && typeof value === 'object' && 'not' in value) {
        return actual !== value.not;
      }
      return actual === value;
    });
  const delegate = {
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(rows.find((item) => item.id === where.id) ?? null),
    ),
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.find((item) => matches(item, where)) ?? null),
    ),
    findMany: jest.fn(({ where }: { where?: Record<string, unknown> } = {}) =>
      Promise.resolve(
        rows
          .filter((item) => matches(item, where))
          .map((i) => ({ ...i, createdBy: null })),
      ),
    ),
    create: jest.fn(({ data }: { data: Partial<Row> }) => {
      const created = row({
        id: `n${counter++}`,
        name: data.name as string,
        kind: data.kind as 'FOLDER' | 'FILE',
        ...data,
      });
      rows.push(created);
      return Promise.resolve({ ...created, createdBy: null });
    }),
    update: jest.fn(
      ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const found = rows.find((item) => item.id === where.id) as Row;
        Object.assign(found, data);
        return Promise.resolve({ ...found, createdBy: null });
      },
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<Row>;
      }) => {
        const found = rows.filter((item) => matches(item, where));
        found.forEach((item) => Object.assign(item, data));
        return Promise.resolve({ count: found.length });
      },
    ),
  };
  const put = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockResolvedValue(undefined);
  const storage: ObjectStorage = {
    put,
    get: jest.fn().mockResolvedValue(null),
    delete: del,
    deletePrefix: jest.fn().mockResolvedValue(undefined),
    presignGet: jest.fn().mockResolvedValue(null),
  };
  const service = new RepositoryService(
    { repositoryNode: delegate } as unknown as PrismaService,
    storage,
    {} as JwtService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { service, rows, put, del, delegate };
}

const folder = (
  id: string,
  name: string,
  parentId: string | null = null,
  system = false,
) => row({ id, name, kind: 'FOLDER', parentId, system });

describe('RepositoryService', () => {
  describe('createFolder', () => {
    it('rejects duplicate names case-insensitively', async () => {
      const { service } = build([folder('a', 'Contratos')]);
      await expect(
        service.createFolder(undefined, 'contratos'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects names that sanitize to nothing', async () => {
      const { service } = build([]);
      await expect(
        service.createFolder(undefined, '..'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('upload', () => {
    const pdf = {
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1'),
    };

    it('auto-numbers colliding names and stores under reports/', async () => {
      const { service, put, rows } = build([
        row({ id: 'f', name: 'a.pdf', kind: 'FILE', storageKey: 'reports/x' }),
      ]);
      const result = await service.upload(undefined, [pdf]);
      expect(result.items[0].name).toBe('a (2).pdf');
      const key = put.mock.calls[0][0] as string;
      expect(key.startsWith('reports/')).toBe(true);
      expect(rows).toHaveLength(2);
    });

    it('stores nothing when any file fails validation', async () => {
      const { service, put } = build([]);
      const bad = {
        originalname: 'x.exe',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('MZ'),
      };
      await expect(
        service.upload(undefined, [pdf, bad]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(put).not.toHaveBeenCalled();
    });

    it('rejects path traversal names by sanitizing them', async () => {
      const { service } = build([]);
      const result = await service.upload(undefined, [
        { ...pdf, originalname: '../../a.pdf' },
      ]);
      expect(result.items[0].name).toBe('-a.pdf');
    });
  });

  describe('update', () => {
    it('forbids moving a folder into its own descendant', async () => {
      const { service } = build([
        folder('a', 'A'),
        folder('b', 'B', 'a'),
        folder('c', 'C', 'b'),
      ]);
      await expect(
        service.update('a', { parentId: 'c' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update('a', { parentId: 'a' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('moves to the root with parentId null', async () => {
      const { service } = build([folder('a', 'A'), folder('b', 'B', 'a')]);
      const moved = await service.update('b', { parentId: null });
      expect(moved.name).toBe('B');
    });

    it('rejects a rename that collides with a sibling', async () => {
      const { service } = build([folder('a', 'A'), folder('b', 'B')]);
      await expect(service.update('b', { name: 'a' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to touch system nodes', async () => {
      const { service } = build([folder('s', 'Cierres de caja', null, true)]);
      await expect(service.update('s', { name: 'x' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes a folder with all its contents', async () => {
      const { service, rows } = build([
        folder('a', 'A'),
        folder('b', 'B', 'a'),
        row({ id: 'f', name: 'x.pdf', kind: 'FILE', parentId: 'b' }),
      ]);
      const result = await service.remove('a');
      expect(result.deleted).toBe(3);
      expect(rows.every((item) => item.deletedAt)).toBe(true);
    });

    it('refuses system nodes and folders that contain them', async () => {
      const { service } = build([
        folder('s', 'Sistema', null, true),
        folder('u', 'Mía'),
        folder('child', 'Cierres', 'u', true),
      ]);
      await expect(service.remove('s')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.remove('u')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('saveSystemFile', () => {
    const input = {
      folderPath: ['Cierres de caja', '2026', '11'],
      name: '2026-11-17 Cierre de caja.pdf',
      buffer: Buffer.from('%PDF'),
      mimeType: 'application/pdf',
    };

    it('creates the missing folders as system folders', async () => {
      const { service, rows } = build([]);
      await service.saveSystemFile(input);
      const folders = rows.filter((item) => item.kind === 'FOLDER');
      expect(folders.map((item) => item.name)).toEqual([
        'Cierres de caja',
        '2026',
        '11',
      ]);
      expect(folders.every((item) => item.system)).toBe(true);
      expect(rows.find((item) => item.kind === 'FILE')?.parentId).toBe(
        folders[2].id,
      );
    });

    it('replaces a same-name file keeping the node id and deleting the old object', async () => {
      const { service, del, rows } = build([]);
      const first = await service.saveSystemFile(input);
      const oldKey = rows.find((item) => item.kind === 'FILE')?.storageKey;
      const second = await service.saveSystemFile({
        ...input,
        buffer: Buffer.from('%PDF-2'),
      });
      expect(second.id).toBe(first.id);
      expect(rows.filter((item) => item.kind === 'FILE')).toHaveLength(1);
      expect(del).toHaveBeenCalledWith(oldKey);
      expect(rows.find((item) => item.kind === 'FILE')?.size).toBe(6);
    });

    it('reuses existing folders instead of duplicating them', async () => {
      const { service, rows } = build([]);
      await service.saveSystemFile(input);
      await service.saveSystemFile({ ...input, name: 'otro.pdf' });
      expect(rows.filter((item) => item.kind === 'FOLDER')).toHaveLength(3);
    });
  });
});
