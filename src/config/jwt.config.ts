import type { JwtSignOptions } from '@nestjs/jwt';

export const DEFAULT_JWT_EXPIRES_IN = '12h';
export const JWT_EXPIRES_IN_PATTERN = /^(\d+|\d+\s?(s|m|h|d|w))$/;

export function resolveJwtExpiresIn(
  value?: string,
): JwtSignOptions['expiresIn'] {
  const raw = value?.trim();
  if (!raw) return DEFAULT_JWT_EXPIRES_IN;
  return (/^\d+$/.test(raw) ? Number(raw) : raw) as JwtSignOptions['expiresIn'];
}
