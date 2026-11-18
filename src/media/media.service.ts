import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from './application/ports/object-storage.port';
import {
  imageUrls,
  productImageKey,
  variantKey,
  type ImageUrls,
} from './domain/image-variants';
import {
  InvalidImageError,
  processImage,
} from './infrastructure/sharp-image.processor';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly config: ConfigService,
  ) {}

  get baseUrl(): string {
    return (
      this.config.get<string>('ASSETS_BASE_URL') ??
      `http://localhost:${this.config.get<string>('PORT') ?? '3000'}/uploads`
    );
  }

  urlsFor(imageKey: string | null | undefined): ImageUrls | null {
    return imageUrls(this.baseUrl, imageKey);
  }

  /** Processes and stores an upload; returns the new immutable key. */
  async saveProductImage(productId: string, file: Buffer): Promise<string> {
    try {
      const processed = await processImage(file);
      const imageKey = productImageKey(productId, processed.hash);
      await Promise.all(
        processed.variants.map((variant) =>
          this.storage.put(
            variantKey(imageKey, variant.name),
            variant.body,
            'image/webp',
          ),
        ),
      );
      return imageKey;
    } catch (error) {
      if (error instanceof InvalidImageError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async remove(imageKey: string | null | undefined): Promise<void> {
    if (!imageKey) return;
    try {
      await this.storage.deletePrefix(imageKey);
    } catch (error) {
      this.logger.warn(`Could not delete ${imageKey}: ${String(error)}`);
    }
  }
}
