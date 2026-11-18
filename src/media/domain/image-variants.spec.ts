import { imageUrls, productImageKey, variantKey } from './image-variants';

describe('image variants', () => {
  it('builds immutable keys from the content hash', () => {
    expect(productImageKey('p1', 'abc123')).toBe('products/p1/abc123');
    expect(variantKey('products/p1/abc123', 'thumb')).toBe(
      'products/p1/abc123/thumb.webp',
    );
  });

  it('builds public urls without duplicate slashes', () => {
    expect(imageUrls('https://cdn.example.com/', 'products/p1/abc')).toEqual({
      thumb: 'https://cdn.example.com/products/p1/abc/thumb.webp',
      large: 'https://cdn.example.com/products/p1/abc/large.webp',
    });
  });

  it('returns null when the product has no image', () => {
    expect(imageUrls('https://cdn.example.com', null)).toBeNull();
  });
});
