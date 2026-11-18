import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import {
  RepositoryContentController,
  RepositoryController,
} from './repository.controller';
import { RepositoryService } from './repository.service';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [RepositoryController, RepositoryContentController],
  providers: [RepositoryService],
  exports: [RepositoryService],
})
export class RepositoryModule {}
