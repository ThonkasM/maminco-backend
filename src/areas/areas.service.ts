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
    constructor(private prisma: PrismaService) { }

    /**
     * Crear nueva área
     */
    async create(createAreaDto: CreateAreaDto): Promise<AreaResponseDto> {
        // Validar que el nombre no exista
        const existingArea = await this.prisma.area.findUnique({
            where: { name: createAreaDto.name },
        });

        if (existingArea) {
            throw new ConflictException(
                `Area with name "${createAreaDto.name}" already exists`,
            );
        }

        // Crear área
        const area = await this.prisma.area.create({
            data: {
                name: createAreaDto.name,
                description: createAreaDto.description,
                isVirtual: createAreaDto.isVirtual ?? false,
            },
        });

        return new AreaResponseDto(area);
    }

    /**
     * Obtener lista de áreas con paginación
     */
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
            (area) =>
                new AreaResponseDto(area, (area as any)._count?.tables || 0),
        );
        return new PaginatedAreaResponseDto(areaDtos, total, page, limit);
    }

    /**
     * Obtener área por ID
     */
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

        return new AreaResponseDto(area, (area as any)._count?.tables || 0);
    }

    /**
     * Actualizar área
     */
    async update(
        id: string,
        updateAreaDto: UpdateAreaDto,
    ): Promise<AreaResponseDto> {
        // Verificar que el área existe
        const area = await this.prisma.area.findUnique({
            where: { id },
        });

        if (!area || area.deletedAt) {
            throw new NotFoundException(`Area with ID ${id} not found`);
        }

        // Si está actualizando el nombre, verificar que no exista
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

        // Actualizar área
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

    /**
     * Desactivar/Eliminar área (soft delete)
     */
    async deactivate(id: string): Promise<AreaResponseDto> {
        // Verificar que el área existe
        const area = await this.prisma.area.findUnique({
            where: { id },
        });

        if (!area || area.deletedAt) {
            throw new NotFoundException(`Area with ID ${id} not found`);
        }

        // Soft delete: establecer deletedAt e isActive = false
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

    /**
     * Obtener todas las áreas activas (sin paginación)
     * Útil para select/dropdown en UI
     */
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

        return areas.map(
            (area) =>
                new AreaResponseDto(area, (area as any)._count?.tables || 0),
        );
    }
}
