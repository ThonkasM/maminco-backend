import { Injectable, Logger } from '@nestjs/common';
import type {
  PushChannel,
  PushMessage,
  PushOutcome,
  PushTarget,
} from '../application/ports/push-channel.port';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

@Injectable()
export class ExpoPushChannel implements PushChannel {
  readonly kind = 'EXPO' as const;
  private readonly logger = new Logger(ExpoPushChannel.name);

  isEnabled(): boolean {
    return true;
  }

  async send(target: PushTarget, message: PushMessage): Promise<PushOutcome> {
    try {
      const response = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: target.endpoint,
          title: message.title,
          body: message.body,
          data: { url: message.url, notificationId: message.notificationId },
          sound: 'default',
        }),
      });
      if (!response.ok) return 'failed';
      const payload = (await response.json()) as {
        data?: { status?: string; details?: { error?: string } };
      };
      if (payload.data?.details?.error === 'DeviceNotRegistered') return 'gone';
      return payload.data?.status === 'ok' ? 'sent' : 'failed';
    } catch {
      this.logger.warn('Expo push request failed');
      return 'failed';
    }
  }
}
