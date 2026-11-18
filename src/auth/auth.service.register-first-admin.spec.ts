import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));

const dto = {
  email: 'admin@maminco.test',
  password: 'Secret123',
  name: 'Admin',
};

function setup(userCount: number, existing: object | null) {
  const created = {
    id: 'u1',
    email: dto.email,
    name: dto.name,
    role: 'ADMINISTRATOR',
    isActive: true,
    createdAt: new Date(),
  };
  const prisma = {
    user: {
      count: jest.fn().mockResolvedValue(userCount),
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue(created),
    },
  };
  const jwt = { sign: jest.fn().mockReturnValue('token') };
  return {
    prisma,
    jwt,
    service: new AuthService(prisma as never, jwt as never),
  };
}

describe('AuthService.registerFirstAdmin (basis path, V(G)=3)', () => {
  it('C1: refuses when users already exist', async () => {
    const { service, prisma } = setup(1, null);
    await expect(service.registerFirstAdmin(dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('C2: refuses a duplicated email', async () => {
    const { service, prisma } = setup(0, { id: 'x' });
    await expect(service.registerFirstAdmin(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('C3: creates the first administrator and returns a token', async () => {
    const { service, prisma, jwt } = setup(0, null);
    const result = await service.registerFirstAdmin(dto);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', role: 'ADMINISTRATOR' }),
    );
    expect(result.accessToken).toBe('token');
    expect(result.user).not.toHaveProperty('password');
  });
});
