import { User, UserRole } from '@prisma/client';

type UserSource = Pick<
  User,
  'id' | 'email' | 'name' | 'role' | 'isActive' | 'createdAt' | 'updatedAt'
>;

export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(user: UserSource) {
    this.id = user.id;
    this.email = user.email;
    this.name = user.name;
    this.role = user.role;
    this.isActive = user.isActive;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}
