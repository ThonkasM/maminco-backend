import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [NotificationsModule, MediaModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
