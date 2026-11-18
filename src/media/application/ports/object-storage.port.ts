import type { Readable } from 'node:stream';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
/** Legacy name kept for the image code path. */
export const IMAGE_STORAGE = OBJECT_STORAGE;

export interface StoredObject {
  stream: Readable;
  size?: number;
}

export interface PresignOptions {
  expiresIn: number;
  filename: string;
  contentType: string;
  inline: boolean;
}

/**
 * Where bytes live. Local disk in development, S3 in production, with the same key layout:
 * `products/...` (public images, served by CloudFront) and `reports/<uuid>` (private documents).
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  /** Direct, time-limited download URL, or null when the backend must stream the file itself. */
  presignGet(key: string, options: PresignOptions): Promise<string | null>;
}

export type ImageStorage = ObjectStorage;
