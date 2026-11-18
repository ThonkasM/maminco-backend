import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type {
  ObjectStorage,
  StoredObject,
} from '../application/ports/object-storage.port';

/** Mirrors the S3 key layout under a local folder (`uploads/products/<id>/<hash>/thumb.webp`). */
export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    const target = resolve(this.root, key);
    if (!target.startsWith(this.root + sep)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async get(key: string): Promise<StoredObject | null> {
    const target = this.pathFor(key);
    try {
      const info = await stat(target);
      if (!info.isFile()) return null;
      return { stream: createReadStream(target), size: info.size };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.pathFor(prefix), { recursive: true, force: true });
  }

  presignGet(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

export { LocalObjectStorage as LocalImageStorage };
