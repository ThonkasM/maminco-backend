import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAreaDto,
  UpdateAreaDto,
  ListAreasQueryDto,
  AreaResponseDto,
  PaginatedAreaResponseDto,
} from './dto';

@Injectable()
export class AreasService {
  constructor(private prisma: PrismaService) {}

  async create(createAreaDto: CreateAreaDto): Promise<AreaResponseDto> {
    const existingArea = await this.prisma.area.findUnique({
      where: { name: createAreaDto.name },
    });

    if (existingArea) {
      throw new ConflictException(
        `Area with name "${createAreaDto.name}" already exists`,
      );
    }

    const area = await this.prisma.area.create({
      data: {
        name: createAreaDto.name,
        description: createAreaDto.description,
        isVirtual: createAreaDto.isVirtual ?? false,
      },
    });

    return new AreaResponseDto(area);
  }

  async findAll(
    query: ListAreasQueryDto,
  ): Promise<PaginatedAreaResponseDto<AreaResponseDto>> {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null, // Solo áreas no eliminadas (soft delete)
      ...(search && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
    };

    const [areas, total] = await Promise.all([
      this.prisma.area.findMany({
        where,
        include: {
          _count: {
            select: { tables: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.area.count({ where }),
    ]);

    const areaDtos = areas.map(
      (area) => new AreaResponseDto(area, area._count.tables),
    );
    return new PaginatedAreaResponseDto(areaDtos, total, page, limit);
  }

  async findById(id: string): Promise<AreaResponseDto> {
    const area = await this.prisma.area.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tables: true },
        },
      },
    });

    if (!area || area.deletedAt) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }

    return new AreaResponseDto(area, area._count.tables);
  }

  async update(
    id: string,
    updateAreaDto: UpdateAreaDto,
  ): Promise<AreaResponseDto> {
    const area = await this.prisma.area.findUnique({
      where: { id },
    });

    if (!area || area.deletedAt) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }

    if (updateAreaDto.name && updateAreaDto.name !== area.name) {
      const existingArea = await this.prisma.area.findUnique({
        where: { name: updateAreaDto.name },
      });

      if (existingArea) {
        throw new ConflictException(
          `Area with name "${updateAreaDto.name}" already exists`,
        );
      }
    }

    const updatedArea = await this.prisma.area.update({
      where: { id },
      data: updateAreaDto,
      include: {
        _count: {
          select: { tables: true },
        },
      },
    });

    return new AreaResponseDto(
      updatedArea,
      (updatedArea as any)._count?.tables || 0,
    );
  }

  async deactivate(id: string): Promise<AreaResponseDto> {
    const area = await this.prisma.area.findUnique({
      where: { id },
    });

    if (!area || area.deletedAt) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    const deletedArea = await this.prisma.area.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      include: {
        _count: {
          select: { tables: true },
        },
      },
    });

    return new AreaResponseDto(
      deletedArea,
      (deletedArea as any)._count?.tables || 0,
    );
  }

  async getAllActive(): Promise<AreaResponseDto[]> {
    const areas = await this.prisma.area.findMany({
      where: {
        deletedAt: null,
        isActive: true,
      },
      include: {
        _count: {
          select: { tables: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return areas.map((area) => new AreaResponseDto(area, area._count.tables));
  }
}
