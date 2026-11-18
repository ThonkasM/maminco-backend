import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { LocalObjectStorage } from './infrastructure/local-object.storage';
import {
  InvalidImageError,
  processImage,
} from './infrastructure/sharp-image.processor';

const photo = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#c0392b' },
  })
    .jpeg()
    .toBuffer();

describe('processImage', () => {
  it('produces square WebP variants at the configured sizes', async () => {
    const result = await processImage(await photo(1600, 900));
    expect(result.hash).toHaveLength(12);
    for (const variant of result.variants) {
      const meta = await sharp(variant.body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(meta.height);
    }
    const sizes = await Promise.all(
      result.variants.map(async (v) => (await sharp(v.body).metadata()).width),
    );
    expect(sizes).toEqual([320, 960]);
  });

  it('is much smaller than the original upload', async () => {
    const original = await photo(3000, 2000);
    const result = await processImage(original);
    const thumb = result.variants.find((v) => v.name === 'thumb');
    expect(thumb?.body.length).toBeLessThan(original.length / 4);
  });

  it('gives the same hash for the same bytes', async () => {
    const buffer = await photo(800, 800);
    expect((await processImage(buffer)).hash).toBe(
      (await processImage(buffer)).hash,
    );
  });

  it('rejects files that are not images', async () => {
    await expect(processImage(Buffer.from('hola'))).rejects.toBeInstanceOf(
      InvalidImageError,
    );
  });

  it('rejects unsupported formats', async () => {
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#fff' },
    })
      .gif()
      .toBuffer();
    await expect(processImage(gif)).rejects.toBeInstanceOf(InvalidImageError);
  });
});

describe('LocalObjectStorage', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'maminco-uploads-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('mirrors the S3 key layout and deletes by prefix', async () => {
    const storage = new LocalObjectStorage(root);
    await storage.put('products/p1/abc/thumb.webp', Buffer.from('x'));
    await storage.put('products/p1/abc/large.webp', Buffer.from('y'));
    expect(await readdir(join(root, 'products/p1/abc'))).toEqual([
      'large.webp',
      'thumb.webp',
    ]);
    await storage.deletePrefix('products/p1/abc');
    expect(await readdir(join(root, 'products/p1'))).toEqual([]);
  });

  it('refuses keys that escape the root', async () => {
    const storage = new LocalObjectStorage(root);
    await expect(
      storage.put('../outside.webp', Buffer.from('x')),
    ).rejects.toThrow('Invalid storage key');
  });
});
