import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PUSH_CHANNELS } from './application/ports/push-channel.port';
import { ExpoPushChannel } from './infrastructure/expo-push.channel';
import { WebPushChannel } from './infrastructure/web-push.channel';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    WebPushChannel,
    ExpoPushChannel,
    {
      provide: PUSH_CHANNELS,
      inject: [WebPushChannel, ExpoPushChannel],
      useFactory: (web: WebPushChannel, expo: ExpoPushChannel) => [web, expo],
    },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
