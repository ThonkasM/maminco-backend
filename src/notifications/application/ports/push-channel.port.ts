export const PUSH_CHANNELS = Symbol('PUSH_CHANNELS');

export interface PushTarget {
  kind: 'WEB' | 'EXPO';
  endpoint: string;
  p256dh?: string | null;
  auth?: string | null;
}

export interface PushMessage {
  notificationId: string;
  title: string;
  body: string;
  url?: string;
}

export type PushOutcome = 'sent' | 'gone' | 'failed';

/** One delivery mechanism (Web Push, Expo, ...). Add a channel by implementing this port. */
export interface PushChannel {
  readonly kind: PushTarget['kind'];
  isEnabled(): boolean;
  send(target: PushTarget, message: PushMessage): Promise<PushOutcome>;
}
