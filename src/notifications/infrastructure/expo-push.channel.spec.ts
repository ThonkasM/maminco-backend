import { ExpoPushChannel } from './expo-push.channel';

describe('ExpoPushChannel', () => {
  const target = { endpoint: 'ExponentPushToken[abc]' } as never;
  const message = {
    title: 'Aviso',
    body: 'Cuerpo',
    url: '/pos/tables',
    notificationId: 'n1',
  } as never;
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(payload: unknown, ok = true) {
    const fn = jest.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(payload),
    });
    global.fetch = fn;
    return fn;
  }

  it('sends to the default Android channel with high priority', async () => {
    const fn = mockFetch({ data: { status: 'ok' } });
    const outcome = await new ExpoPushChannel().send(target, message);
    expect(outcome).toBe('sent');
    const body = JSON.parse(
      (fn.mock.calls[0] as [string, { body: string }])[1].body,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      to: 'ExponentPushToken[abc]',
      channelId: 'default',
      priority: 'high',
      sound: 'default',
    });
  });

  it('reports gone when the device is no longer registered', async () => {
    mockFetch({
      data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
    });
    expect(await new ExpoPushChannel().send(target, message)).toBe('gone');
  });

  it('reports failed when Expo rejects the request', async () => {
    mockFetch({}, false);
    expect(await new ExpoPushChannel().send(target, message)).toBe('failed');
  });
});
