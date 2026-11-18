import { UserRole } from '@prisma/client';

export interface AuthUser {
  sub: string;
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}
