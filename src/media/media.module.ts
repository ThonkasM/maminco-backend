import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OBJECT_STORAGE } from './application/ports/object-storage.port';
import { LocalObjectStorage } from './infrastructure/local-object.storage';
import { S3ObjectStorage } from './infrastructure/s3-object.storage';
import { MediaService } from './media.service';

@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get<string>('STORAGE_DRIVER') === 's3') {
          return new S3ObjectStorage(
            config.getOrThrow<string>('S3_BUCKET'),
            config.get<string>('S3_REGION') ?? 'us-east-1',
            config.get<string>('S3_KEY_PREFIX') ?? '',
          );
        }
        return new LocalObjectStorage(
          config.get<string>('UPLOADS_DIR') ?? './uploads',
        );
      },
    },
    MediaService,
  ],
  exports: [MediaService, OBJECT_STORAGE],
})
export class MediaModule {}
