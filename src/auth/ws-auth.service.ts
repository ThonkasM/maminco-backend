import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export interface SocketUser {
  id: string;
  name: string;
  role: UserRole;
}

@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(socket: Socket): Promise<SocketUser | null> {
    const token = (socket.handshake.auth as { token?: string } | undefined)
      ?.token;
    if (!token) return null;

    const payload = this.jwtService.verify<{ sub?: string }>(token);
    if (!payload?.sub) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) return null;

    return { id: user.id, name: user.name, role: user.role };
  }
}
