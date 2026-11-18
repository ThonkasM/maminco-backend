import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type {
  PushChannel,
  PushMessage,
  PushOutcome,
  PushTarget,
} from '../application/ports/push-channel.port';

@Injectable()
export class WebPushChannel implements PushChannel {
  readonly kind = 'WEB' as const;
  private readonly logger = new Logger(WebPushChannel.name);
  private readonly enabled: boolean;
  readonly publicKey: string | null;

  constructor(config: ConfigService) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
    this.enabled = Boolean(publicKey && privateKey);
    this.publicKey = this.enabled ? (publicKey ?? null) : null;
    if (this.enabled && publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } else {
      this.logger.warn('VAPID keys not configured: Web Push is disabled.');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(target: PushTarget, message: PushMessage): Promise<PushOutcome> {
    if (!target.p256dh || !target.auth) return 'gone';
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(message),
        { TTL: 60 * 60 },
      );
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      this.logger.warn(`Web Push failed (${status ?? 'network'})`);
      return 'failed';
    }
  }
}
