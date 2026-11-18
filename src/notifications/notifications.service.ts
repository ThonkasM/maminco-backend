import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { NotificationType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PUSH_CHANNELS,
  type PushChannel,
  type PushMessage,
  type PushTarget,
} from './application/ports/push-channel.port';
import {
  AUTOMATIC_TYPES,
  DEFAULT_RULES,
  type AutomaticType,
  type NotificationContent,
} from './domain/notification-rules';
import { WebPushChannel } from './infrastructure/web-push.channel';

export interface PublishInput extends NotificationContent {
  type: NotificationType;
  roles?: UserRole[];
  userIds?: string[];
  createdById?: string;
  data?: Prisma.InputJsonValue;
}

const BATCH = 10;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush: WebPushChannel,
    @Inject(PUSH_CHANNELS) private readonly channels: PushChannel[],
  ) {}

  pushConfig() {
    return {
      webPublicKey: this.webPush.publicKey,
      channels: this.channels
        .filter((channel) => channel.isEnabled())
        .map((channel) => channel.kind),
    };
  }

  async publish(input: PublishInput) {
    const roles = input.roles ?? [];
    const userIds = input.userIds ?? [];
    if (roles.length === 0 && userIds.length === 0) {
      throw new BadRequestException('Elige al menos un destinatario.');
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ role: { in: roles } }, { id: { in: userIds } }],
      },
      select: { id: true },
    });
    if (recipients.length === 0) {
      throw new BadRequestException(
        'No hay usuarios activos para esa audiencia.',
      );
    }

    const notification = await this.prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        body: input.body,
        url: input.url,
        data: input.data,
        audienceRoles: roles,
        audienceUserIds: userIds,
        createdById: input.createdById,
        receipts: {
          create: recipients.map((user) => ({ userId: user.id })),
        },
      },
    });

    void this.dispatchPush(
      notification.id,
      recipients.map((user) => user.id),
      { notificationId: notification.id, ...pickContent(input) },
    ).catch((error: unknown) =>
      this.logger.warn(`Push dispatch failed: ${String(error)}`),
    );

    return { id: notification.id, recipients: recipients.length };
  }

  /** Publishes a system-generated notification if its rule is enabled. */
  async publishAutomatic(
    type: AutomaticType,
    content: NotificationContent,
    data?: Prisma.InputJsonValue,
  ) {
    try {
      const rule = await this.ruleFor(type);
      if (!rule.enabled || rule.audienceRoles.length === 0) return null;
      return await this.publish({
        type,
        ...content,
        roles: rule.audienceRoles,
        data,
      });
    } catch (error) {
      this.logger.warn(`Automatic notification skipped: ${String(error)}`);
      return null;
    }
  }

  private async ruleFor(type: AutomaticType) {
    const stored = await this.prisma.notificationRule.findUnique({
      where: { type },
    });
    return stored ?? { type, ...DEFAULT_RULES[type] };
  }

  async getRules() {
    const stored = await this.prisma.notificationRule.findMany();
    return AUTOMATIC_TYPES.map((type) => {
      const rule = stored.find((item) => item.type === type);
      return {
        type,
        enabled: rule?.enabled ?? DEFAULT_RULES[type].enabled,
        audienceRoles: rule?.audienceRoles ?? DEFAULT_RULES[type].audienceRoles,
      };
    });
  }

  async updateRule(type: string, enabled: boolean, audienceRoles: UserRole[]) {
    if (!(AUTOMATIC_TYPES as readonly string[]).includes(type)) {
      throw new NotFoundException('Regla no encontrada');
    }
    const rule = await this.prisma.notificationRule.upsert({
      where: { type: type as AutomaticType },
      create: { type: type as AutomaticType, enabled, audienceRoles },
      update: { enabled, audienceRoles },
    });
    return {
      type: rule.type,
      enabled: rule.enabled,
      audienceRoles: rule.audienceRoles,
    };
  }

  async listForUser(userId: string, limit = 30, unreadOnly = false) {
    const [items, unread] = await Promise.all([
      this.prisma.notificationReceipt.findMany({
        where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { notification: true },
      }),
      this.unreadCount(userId),
    ]);
    return {
      unread,
      items: items.map((receipt) => ({
        id: receipt.notificationId,
        type: receipt.notification.type,
        title: receipt.notification.title,
        body: receipt.notification.body,
        url: receipt.notification.url,
        createdAt: receipt.notification.createdAt,
        readAt: receipt.readAt,
      })),
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notificationReceipt.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.notificationReceipt.updateMany({
      where: { userId, notificationId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notificationReceipt.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async history(limit = 50) {
    const rows = await this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        createdBy: { select: { name: true } },
        receipts: { select: { readAt: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      createdByName: row.createdBy?.name ?? null,
      audienceRoles: row.audienceRoles,
      recipients: row.receipts.length,
      read: row.receipts.filter((receipt) => receipt.readAt).length,
    }));
  }

  async subscribe(
    userId: string,
    dto: {
      kind: 'WEB' | 'EXPO';
      endpoint: string;
      p256dh?: string;
      auth?: string;
    },
    userAgent?: string,
  ) {
    if (dto.kind === 'WEB' && (!dto.p256dh || !dto.auth)) {
      throw new BadRequestException('Suscripción web incompleta.');
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        kind: dto.kind,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent,
      },
      update: { userId, p256dh: dto.p256dh, auth: dto.auth, userAgent },
    });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { ok: true };
  }

  private async dispatchPush(
    notificationId: string,
    userIds: string[],
    message: PushMessage,
  ) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });
    const gone: string[] = [];
    for (let i = 0; i < subscriptions.length; i += BATCH) {
      const batch = subscriptions.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (subscription) => {
          const channel = this.channels.find(
            (item) => item.kind === subscription.kind && item.isEnabled(),
          );
          if (!channel) return;
          const target: PushTarget = {
            kind: subscription.kind,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          };
          const outcome = await channel.send(target, message);
          if (outcome === 'gone') gone.push(subscription.id);
        }),
      );
    }
    if (gone.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: gone } },
      });
    }
    this.logger.log(
      `Notification ${notificationId}: ${subscriptions.length} push target(s)`,
    );
  }
}

function pickContent(input: NotificationContent) {
  return { title: input.title, body: input.body, url: input.url };
}
