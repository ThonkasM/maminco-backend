import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  ObjectStorage,
  PresignOptions,
  StoredObject,
} from '../application/ports/object-storage.port';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const PRIVATE = 'private, no-store';

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    region: string,
    private readonly keyPrefix = '',
  ) {
    this.client = new S3Client({ region });
  }

  private full(key: string) {
    return `${this.keyPrefix}${key}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.full(key),
        Body: body,
        ContentType: contentType,
        // Images are content-addressed (immutable); documents must never be cached by shared caches.
        CacheControl: key.startsWith('products/') ? IMMUTABLE : PRIVATE,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.full(key) }),
      );
      if (!(result.Body instanceof Readable)) return null;
      return { stream: result.Body, size: result.ContentLength };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.full(key) }),
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    const listed = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `${this.full(prefix)}/`,
      }),
    );
    const objects = (listed.Contents ?? []).flatMap((item) =>
      item.Key ? [{ Key: item.Key }] : [],
    );
    if (objects.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: objects },
      }),
    );
  }

  /** The browser downloads straight from S3: the backend is not in the data path. */
  presignGet(key: string, options: PresignOptions): Promise<string | null> {
    const safeName = encodeURIComponent(options.filename).replace(/'/g, '%27');
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.full(key),
        ResponseContentType: options.contentType,
        ResponseContentDisposition: `${options.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`,
      }),
      { expiresIn: options.expiresIn },
    );
  }
}

export { S3ObjectStorage as S3ImageStorage };
