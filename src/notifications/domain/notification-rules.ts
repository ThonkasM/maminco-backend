import type { NotificationType, UserRole } from '@prisma/client';

export const AUTOMATIC_TYPES = [
  'PRICE_UPDATE',
  'MENU_UPDATE',
  'SYSTEM_ALERT',
] as const satisfies readonly NotificationType[];

export type AutomaticType = (typeof AUTOMATIC_TYPES)[number];

export interface RuleDefaults {
  enabled: boolean;
  audienceRoles: UserRole[];
}

export const DEFAULT_RULES: Record<AutomaticType, RuleDefaults> = {
  PRICE_UPDATE: {
    enabled: true,
    audienceRoles: ['WAITER', 'CASHIER', 'MANAGER'],
  },
  MENU_UPDATE: {
    enabled: true,
    audienceRoles: ['WAITER', 'CASHIER', 'COOK', 'MANAGER'],
  },
  SYSTEM_ALERT: { enabled: true, audienceRoles: ['MANAGER', 'ADMINISTRATOR'] },
};

export interface NotificationContent {
  title: string;
  body: string;
  url?: string;
}

const bs = (value: number) =>
  `Bs. ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function describePriceChange(
  name: string,
  from: number,
  to: number,
): NotificationContent {
  const direction = to > from ? 'subió' : 'bajó';
  return {
    title: 'Precio actualizado',
    body: `${name} ${direction} de ${bs(from)} a ${bs(to)}.`,
    url: '/pos/tables',
  };
}

export function describeAvailability(
  names: string[],
  available: boolean,
): NotificationContent {
  const list =
    names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`;
  return {
    title: available ? 'Disponible de nuevo' : 'Producto agotado',
    body: available
      ? `${list} ${names.length === 1 ? 'vuelve' : 'vuelven'} a estar disponible.`
      : `${list} ${names.length === 1 ? 'ya no está' : 'ya no están'} disponible${names.length === 1 ? '' : 's'}.`,
    url: '/pos/tables',
  };
}
