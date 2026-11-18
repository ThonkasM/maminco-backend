import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import type { Prisma, RepositoryNode } from '@prisma/client';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../media/application/ports/object-storage.port';
import { PrismaService } from '../prisma/prisma.service';
import {
  TRASH_RETENTION_DAYS,
  checkUpload,
  createsCycle,
  isInlineType,
  sanitizeName,
  uniqueName,
} from './domain/repository-rules';

export interface SaveSystemFileInput {
  /** Folder names from the root, e.g. ['Cierres de caja', '2026', '11']. Created (as system folders) when missing. */
  folderPath: string[];
  name: string;
  buffer: Buffer;
  mimeType: string;
  createdById?: string;
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

type NodeWithAuthor = RepositoryNode & { createdBy: { name: string } | null };

export const URL_TTL_SECONDS = 300;
const SYSTEM_LOCKED = 'Los elementos del sistema no se pueden modificar.';

@Injectable()
export class RepositoryService {
  private readonly logger = new Logger(RepositoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private view(node: NodeWithAuthor) {
    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      system: node.system,
      mimeType: node.mimeType,
      size: node.size,
      createdByName: node.createdBy?.name ?? null,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }

  private async getFolder(id: string): Promise<RepositoryNode> {
    const node = await this.prisma.repositoryNode.findUnique({ where: { id } });
    if (!node || node.deletedAt || node.kind !== 'FOLDER') {
      throw new NotFoundException('Carpeta no encontrada.');
    }
    return node;
  }

  private async getNode(id: string, includeDeleted = false) {
    const node = await this.prisma.repositoryNode.findUnique({ where: { id } });
    if (!node || (!includeDeleted && node.deletedAt)) {
      throw new NotFoundException('Elemento no encontrado.');
    }
    return node;
  }

  private async siblingNames(
    parentId: string | null,
    excludeId?: string,
  ): Promise<string[]> {
    const siblings = await this.prisma.repositoryNode.findMany({
      where: {
        parentId,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { name: true },
    });
    return siblings.map((item) => item.name);
  }

  private async breadcrumb(parent: RepositoryNode | null) {
    const trail: { id: string; name: string }[] = [];
    let current: RepositoryNode | null = parent;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      trail.unshift({ id: current.id, name: current.name });
      current = current.parentId
        ? await this.prisma.repositoryNode.findUnique({
            where: { id: current.parentId },
          })
        : null;
    }
    return trail;
  }

  async list(parentId?: string) {
    const parent = parentId ? await this.getFolder(parentId) : null;
    const items = await this.prisma.repositoryNode.findMany({
      where: { parentId: parent?.id ?? null, deletedAt: null },
      include: { createdBy: { select: { name: true } } },
    });
    items.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'FOLDER' ? -1 : 1) ||
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    );
    return {
      parent: parent ? { id: parent.id, name: parent.name } : null,
      breadcrumb: await this.breadcrumb(parent),
      items: items.map((item) => this.view(item)),
    };
  }

  async createFolder(
    parentId: string | undefined,
    rawName: string,
    userId?: string,
  ) {
    const parent = parentId ? await this.getFolder(parentId) : null;
    const name = this.cleanName(rawName);
    const taken = await this.siblingNames(parent?.id ?? null);
    if (taken.some((item) => item.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException(`Ya existe un elemento llamado "${name}".`);
    }
    const node = await this.prisma.repositoryNode.create({
      data: {
        name,
        kind: 'FOLDER',
        parentId: parent?.id ?? null,
        createdById: userId,
      },
      include: { createdBy: { select: { name: true } } },
    });
    return this.view(node);
  }

  private cleanName(raw: string): string {
    const name = sanitizeName(raw);
    if (!name) throw new BadRequestException('El nombre no es válido.');
    return name;
  }

  async upload(
    parentId: string | undefined,
    files: UploadedFile[],
    userId?: string,
  ) {
    if (files.length === 0) {
      throw new BadRequestException('Adjunta al menos un archivo.');
    }
    const parent = parentId ? await this.getFolder(parentId) : null;

    // Validate everything first so a bad file does not leave a half-finished upload.
    const checked = files.map((file) => {
      const name = this.cleanName(file.originalname);
      const result = checkUpload(name, file.mimetype, file.buffer);
      if (!result.ok) throw new BadRequestException(result.reason);
      return { file, name, mime: result.mime };
    });

    const taken = await this.siblingNames(parent?.id ?? null);
    const created: ReturnType<RepositoryService['view']>[] = [];
    for (const item of checked) {
      const name = uniqueName(item.name, taken);
      taken.push(name);
      const storageKey = `reports/${randomUUID()}`;
      await this.storage.put(storageKey, item.file.buffer, item.mime);
      try {
        const node = await this.prisma.repositoryNode.create({
          data: {
            name,
            kind: 'FILE',
            parentId: parent?.id ?? null,
            mimeType: item.mime,
            size: item.file.buffer.length,
            storageKey,
            createdById: userId,
          },
          include: { createdBy: { select: { name: true } } },
        });
        created.push(this.view(node));
      } catch (error) {
        await this.storage.delete(storageKey).catch(() => undefined);
        throw error;
      }
    }
    return { items: created };
  }

  async update(id: string, dto: { name?: string; parentId?: string | null }) {
    const node = await this.getNode(id);
    if (node.system) throw new ForbiddenException(SYSTEM_LOCKED);

    const moving = dto.parentId !== undefined && dto.parentId !== node.parentId;
    const renaming = dto.name !== undefined;
    if (!moving && !renaming) {
      throw new BadRequestException(
        'Indica un nombre nuevo o una carpeta destino.',
      );
    }

    let targetParentId = node.parentId;
    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        await this.getFolder(dto.parentId);
        const chain = new Map<string, string | null>();
        let cursor: string | null = dto.parentId;
        while (cursor) {
          const row: { id: string; parentId: string | null } | null =
            await this.prisma.repositoryNode.findUnique({
              where: { id: cursor },
              select: { id: true, parentId: true },
            });
          if (!row) break;
          chain.set(row.id, row.parentId);
          cursor = row.parentId;
        }
        if (
          createsCycle(node.id, dto.parentId, (key) => chain.get(key) ?? null)
        ) {
          throw new BadRequestException(
            'No puedes mover una carpeta dentro de sí misma.',
          );
        }
      }
      targetParentId = dto.parentId;
    }

    const name = renaming ? this.cleanName(dto.name as string) : node.name;
    const taken = await this.siblingNames(targetParentId, node.id);
    if (taken.some((item) => item.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException(
        `Ya existe un elemento llamado "${name}" en esa carpeta.`,
      );
    }

    const updated = await this.prisma.repositoryNode.update({
      where: { id },
      data: { name, parentId: targetParentId },
      include: { createdBy: { select: { name: true } } },
    });
    return this.view(updated);
  }

  /** Every descendant of `rootId` (excluding the root), level by level. */
  private async descendants(
    rootId: string,
    where: Prisma.RepositoryNodeWhereInput = {},
  ): Promise<RepositoryNode[][]> {
    const levels: RepositoryNode[][] = [];
    let frontier = [rootId];
    while (frontier.length > 0) {
      const children = await this.prisma.repositoryNode.findMany({
        where: { parentId: { in: frontier }, ...where },
      });
      if (children.length === 0) break;
      levels.push(children);
      frontier = children.filter((c) => c.kind === 'FOLDER').map((c) => c.id);
    }
    return levels;
  }

  async remove(id: string) {
    const node = await this.getNode(id);
    if (node.system) throw new ForbiddenException(SYSTEM_LOCKED);
    const levels =
      node.kind === 'FOLDER'
        ? await this.descendants(id, { deletedAt: null })
        : [];
    if (levels.flat().some((child) => child.system)) {
      throw new ForbiddenException(SYSTEM_LOCKED);
    }
    const ids = [id, ...levels.flat().map((child) => child.id)];
    await this.prisma.repositoryNode.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    return { deleted: ids.length };
  }

  async trash() {
    const roots = await this.prisma.repositoryNode.findMany({
      where: {
        deletedAt: { not: null },
        OR: [{ parentId: null }, { parent: { deletedAt: null } }],
      },
      include: { createdBy: { select: { name: true } } },
      orderBy: { deletedAt: 'desc' },
    });
    return {
      retentionDays: TRASH_RETENTION_DAYS,
      items: roots.map((item) => ({
        ...this.view(item),
        deletedAt: item.deletedAt,
      })),
    };
  }

  async restore(id: string) {
    const node = await this.getNode(id, true);
    if (!node.deletedAt) {
      throw new BadRequestException('El elemento no está en la papelera.');
    }
    let parentId = node.parentId;
    if (parentId) {
      const parent = await this.prisma.repositoryNode.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.deletedAt) parentId = null;
    }
    const name = uniqueName(node.name, await this.siblingNames(parentId));
    const levels = node.kind === 'FOLDER' ? await this.descendants(id) : [];
    const ids = levels.flat().map((child) => child.id);
    await this.prisma.$transaction([
      this.prisma.repositoryNode.update({
        where: { id },
        data: { deletedAt: null, parentId, name },
      }),
      ...(ids.length > 0
        ? [
            this.prisma.repositoryNode.updateMany({
              where: { id: { in: ids } },
              data: { deletedAt: null },
            }),
          ]
        : []),
    ]);
    return { restored: ids.length + 1, name, parentId };
  }

  async removePermanently(id: string) {
    const node = await this.getNode(id, true);
    if (!node.deletedAt) {
      throw new ConflictException('Primero envía el elemento a la papelera.');
    }
    return this.destroy(node);
  }

  private async destroy(node: RepositoryNode) {
    const levels =
      node.kind === 'FOLDER' ? await this.descendants(node.id) : [];
    const all = [node, ...levels.flat()];
    for (const item of all) {
      if (item.kind === 'FILE' && item.storageKey) {
        await this.storage
          .delete(item.storageKey)
          .catch((error: unknown) =>
            this.logger.warn(
              `Could not delete ${item.storageKey}: ${String(error)}`,
            ),
          );
      }
    }
    // Leaf levels first: the parent relation does not cascade.
    for (const level of [...levels].reverse()) {
      await this.prisma.repositoryNode.deleteMany({
        where: { id: { in: level.map((item) => item.id) } },
      });
    }
    await this.prisma.repositoryNode.delete({ where: { id: node.id } });
    return { deleted: all.length };
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeTrash() {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);
    try {
      const roots = await this.prisma.repositoryNode.findMany({
        where: {
          deletedAt: { lt: cutoff },
          OR: [{ parentId: null }, { parent: { deletedAt: null } }],
        },
      });
      for (const root of roots) await this.destroy(root);
      if (roots.length > 0)
        this.logger.log(`Purged ${roots.length} trashed item(s)`);
    } catch (error) {
      this.logger.warn(`Trash purge failed: ${String(error)}`);
    }
  }

  async search(query: string) {
    const term = query.trim();
    const found = await this.prisma.repositoryNode.findMany({
      where: { deletedAt: null, name: { contains: term, mode: 'insensitive' } },
      include: { createdBy: { select: { name: true } } },
      take: 50,
      orderBy: { name: 'asc' },
    });
    const cache = new Map<string, RepositoryNode | null>();
    const lookup = async (id: string) => {
      if (!cache.has(id)) {
        cache.set(
          id,
          await this.prisma.repositoryNode.findUnique({ where: { id } }),
        );
      }
      return cache.get(id) ?? null;
    };
    const items: (ReturnType<RepositoryService['view']> & {
      parentId: string | null;
      path: string;
    })[] = [];
    for (const item of found) {
      const names: string[] = [];
      let cursor = item.parentId;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const parent = await lookup(cursor);
        if (!parent) break;
        names.unshift(parent.name);
        cursor = parent.parentId;
      }
      items.push({
        ...this.view(item),
        parentId: item.parentId,
        path: ['Repositorio', ...names].join(' / '),
      });
    }
    return { items };
  }

  async usage() {
    const result = await this.prisma.repositoryNode.aggregate({
      where: { kind: 'FILE', deletedAt: null },
      _count: { _all: true },
      _sum: { size: true },
    });
    return { files: result._count._all, bytes: result._sum.size ?? 0 };
  }

  private async getFile(id: string) {
    const node = await this.getNode(id);
    if (node.kind !== 'FILE' || !node.storageKey) {
      throw new NotFoundException('Archivo no encontrado.');
    }
    return node as RepositoryNode & { storageKey: string };
  }

  private get apiBase(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') ??
      `http://localhost:${this.config.get<string>('PORT') ?? '3000'}`
    );
  }

  /** S3: direct presigned URL. Local: signed, short-lived URL served by this backend. */
  async fileUrl(id: string, download: boolean) {
    const node = await this.getFile(id);
    const mime = node.mimeType ?? 'application/octet-stream';
    const inline = !download && isInlineType(mime);
    const direct = await this.storage.presignGet(node.storageKey, {
      expiresIn: URL_TTL_SECONDS,
      filename: node.name,
      contentType: mime,
      inline,
    });
    if (direct) return { url: direct, expiresIn: URL_TTL_SECONDS };
    const token = this.jwt.sign(
      { sub: node.id, typ: 'repo-file' },
      { expiresIn: URL_TTL_SECONDS },
    );
    return {
      url: `${this.apiBase}/api/repository/files/${node.id}/content?token=${token}${download ? '&download=1' : ''}`,
      expiresIn: URL_TTL_SECONDS,
    };
  }

  async openContent(id: string, token: string) {
    try {
      const payload = this.jwt.verify<{ sub: string; typ: string }>(token);
      if (payload.typ !== 'repo-file' || payload.sub !== id) throw new Error();
    } catch {
      throw new ForbiddenException('El enlace no es válido o venció.');
    }
    const node = await this.getFile(id);
    const stored = await this.storage.get(node.storageKey);
    if (!stored) throw new NotFoundException('Archivo no encontrado.');
    return { node, stored };
  }

  /** Replaces a generated file in a system folder, keeping the node id. */
  async saveSystemFile(input: SaveSystemFileInput): Promise<{ id: string }> {
    let parentId: string | null = null;
    for (const segment of input.folderPath) {
      const name = this.cleanName(segment);
      const existing: RepositoryNode | null =
        await this.prisma.repositoryNode.findFirst({
          where: { parentId, name, kind: 'FOLDER', deletedAt: null },
        });
      parentId = existing
        ? existing.id
        : (
            await this.prisma.repositoryNode.create({
              data: { name, kind: 'FOLDER', parentId, system: true },
            })
          ).id;
    }

    const name = this.cleanName(input.name);
    const storageKey = `reports/${randomUUID()}`;
    await this.storage.put(storageKey, input.buffer, input.mimeType);

    const previous = await this.prisma.repositoryNode.findFirst({
      where: { parentId, name, kind: 'FILE', deletedAt: null },
    });
    if (previous) {
      const oldKey = previous.storageKey;
      await this.prisma.repositoryNode.update({
        where: { id: previous.id },
        data: {
          storageKey,
          size: input.buffer.length,
          mimeType: input.mimeType,
          system: true,
        },
      });
      if (oldKey) {
        await this.storage.delete(oldKey).catch(() => undefined);
      }
      return { id: previous.id };
    }
    const node = await this.prisma.repositoryNode.create({
      data: {
        name,
        kind: 'FILE',
        parentId,
        system: true,
        mimeType: input.mimeType,
        size: input.buffer.length,
        storageKey,
        createdById: input.createdById,
      },
    });
    return { id: node.id };
  }
}
