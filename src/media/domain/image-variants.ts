export interface ImageVariant {
  name: 'thumb' | 'large';
  size: number;
  quality: number;
}

/** Square crops: `thumb` feeds cards and lists, `large` feeds the product modal. */
export const IMAGE_VARIANTS: readonly ImageVariant[] = [
  { name: 'thumb', size: 320, quality: 76 },
  { name: 'large', size: 960, quality: 80 },
];

export const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** `<prefix>/<productId>/<contentHash>`: the hash makes every URL immutable. */
export function productImageKey(productId: string, contentHash: string) {
  return `products/${productId}/${contentHash}`;
}

export function variantKey(imageKey: string, variant: ImageVariant['name']) {
  return `${imageKey}/${variant}.webp`;
}

export interface ImageUrls {
  thumb: string;
  large: string;
}

export function imageUrls(
  baseUrl: string,
  imageKey: string | null | undefined,
): ImageUrls | null {
  if (!imageKey) return null;
  const base = baseUrl.replace(/\/+$/, '');
  return {
    thumb: `${base}/${variantKey(imageKey, 'thumb')}`,
    large: `${base}/${variantKey(imageKey, 'large')}`,
  };
}
