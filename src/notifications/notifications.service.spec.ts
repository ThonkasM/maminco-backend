import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushChannel } from './application/ports/push-channel.port';
import type { WebPushChannel } from './infrastructure/web-push.channel';
import { NotificationsService } from './notifications.service';

jest.mock('./infrastructure/web-push.channel', () => ({
  WebPushChannel: class {},
}));

interface Options {
  rule?: { type: string; enabled: boolean; audienceRoles: string[] } | null;
}

function build({ rule = null }: Options = {}) {
  const send = jest.fn().mockResolvedValue('sent');
  const channel: PushChannel = { kind: 'WEB', isEnabled: () => true, send };
  const userFindMany = jest
    .fn()
    .mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
  const notificationCreate = jest.fn().mockResolvedValue({ id: 'n1' });
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    user: { findMany: userFindMany },
    notification: { create: notificationCreate },
    notificationRule: { findUnique: jest.fn().mockResolvedValue(rule) },
    pushSubscription: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 's1', kind: 'WEB', endpoint: 'e1', p256dh: 'k', auth: 'a' },
        ]),
      deleteMany,
    },
  };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    { publicKey: 'pub' } as unknown as WebPushChannel,
    [channel],
  );
  return { service, send, userFindMany, notificationCreate, deleteMany };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('NotificationsService', () => {
  it('rejects an empty audience', async () => {
    const { service } = build();
    await expect(
      service.publish({ type: 'ANNOUNCEMENT', title: 'Hola', body: 'Mundo' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates one receipt per recipient and pushes to their devices', async () => {
    const { service, notificationCreate, send } = build();
    const result = await service.publish({
      type: 'ANNOUNCEMENT',
      title: 'Hola',
      body: 'Mundo',
      roles: ['WAITER'],
    });
    expect(result).toEqual({ id: 'n1', recipients: 2 });
    const [args] = notificationCreate.mock.calls[0] as [
      { data: { receipts: { create: unknown[] } } },
    ];
    expect(args.data.receipts.create).toHaveLength(2);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('removes subscriptions the push service reports as gone', async () => {
    const { service, send, deleteMany } = build();
    send.mockResolvedValue('gone');
    await service.publish({
      type: 'ANNOUNCEMENT',
      title: 'Hola',
      body: 'Mundo',
      userIds: ['u1'],
    });
    await flush();
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s1'] } } });
  });

  it('skips automatic notifications whose rule is disabled', async () => {
    const { service, notificationCreate } = build({
      rule: { type: 'PRICE_UPDATE', enabled: false, audienceRoles: ['WAITER'] },
    });
    const result = await service.publishAutomatic('PRICE_UPDATE', {
      title: 'x',
      body: 'y',
    });
    expect(result).toBeNull();
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it('uses default audiences when no rule is stored', async () => {
    const { service, userFindMany } = build();
    await service.publishAutomatic('PRICE_UPDATE', { title: 'x', body: 'y' });
    const [args] = userFindMany.mock.calls[0] as [
      { where: { OR: { role: { in: string[] } }[] } },
    ];
    expect(args.where.OR[0].role.in).toContain('WAITER');
  });
});
