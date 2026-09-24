import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  /** Map of `key -> enabled`, used by clients to evaluate flags quickly. */
  async evaluate(): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany({
      select: { key: true, enabled: true },
    });
    return Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled]));
  }

  async isEnabled(key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    });
    return flag?.enabled ?? false;
  }

  async update(key: string, enabled: boolean) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { key },
    });
    if (!existing) {
      throw new NotFoundException(`Feature flag no encontrado: ${key}`);
    }
    return this.prisma.featureFlag.update({
      where: { key },
      data: { enabled },
    });
  }
}
