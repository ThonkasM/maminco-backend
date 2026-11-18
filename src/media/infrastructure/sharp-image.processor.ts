import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  ALLOWED_FORMATS,
  IMAGE_VARIANTS,
  type ImageVariant,
} from '../domain/image-variants';

export class InvalidImageError extends Error {}

export interface ProcessedImage {
  hash: string;
  variants: { name: ImageVariant['name']; body: Buffer }[];
}

/** Auto-rotates, square-crops and re-encodes any supported upload as lightweight WebP. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: 50_000_000 }).metadata())
      .format;
  } catch {
    throw new InvalidImageError('El archivo no es una imagen válida.');
  }
  if (!format || !(ALLOWED_FORMATS as readonly string[]).includes(format)) {
    throw new InvalidImageError('Usa una imagen JPG, PNG o WebP.');
  }

  const variants = await Promise.all(
    IMAGE_VARIANTS.map(async (variant) => ({
      name: variant.name,
      body: await sharp(input, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize(variant.size, variant.size, {
          fit: 'cover',
          position: 'attention',
          withoutEnlargement: false,
        })
        .webp({ quality: variant.quality, effort: 5 })
        .toBuffer(),
    })),
  );

  return {
    hash: createHash('sha256').update(input).digest('hex').slice(0, 12),
    variants,
  };
}
