import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TableStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTableDto,
  UpdateTableDto,
  ListTablesQueryDto,
  TableResponseDto,
  ChangeTableStatusDto,
  PaginatedTableResponseDto,
} from './dto';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crear nueva mesa
   */
  async create(createTableDto: CreateTableDto): Promise<TableResponseDto> {
    // Validar que el área existe
    const area = await this.prisma.area.findUnique({
      where: { id: createTableDto.areaId },
    });

    if (!area || area.deletedAt) {
      throw new NotFoundException(
        `Area with ID ${createTableDto.areaId} not found`,
      );
    }

    // Validar que no existe mesa con el mismo número en la misma área
    const existingTable = await this.prisma.table.findUnique({
      where: {
        areaId_number: {
          areaId: createTableDto.areaId,
          number: createTableDto.number,
        },
      },
    });

    if (existingTable && !existingTable.deletedAt) {
      throw new ConflictException(
        `Table number ${createTableDto.number} already exists in this area`,
      );
    }

    // Crear mesa
    const table = await this.prisma.table.create({
      data: {
        number: createTableDto.number,
        areaId: createTableDto.areaId,
      },
      include: {
        area: {
          select: { name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    return new TableResponseDto(table);
  }

  /**
   * Obtener lista de mesas con paginación y filtros
   */
  async findAll(
    query: ListTablesQueryDto,
  ): Promise<PaginatedTableResponseDto<TableResponseDto>> {
    const { page = 1, limit = 10, number, areaId, status } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null, // Solo mesas no eliminadas
      ...(number !== undefined && { number }),
      ...(areaId && { areaId }),
      ...(status && { status }),
    };

    const [tables, total] = await Promise.all([
      this.prisma.table.findMany({
        where,
        include: {
          area: {
            select: { name: true },
          },
          _count: {
            select: { orders: true },
          },
        },
        skip,
        take: limit,
        orderBy: [{ areaId: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.table.count({ where }),
    ]);

    const tableDtos = tables.map((table) => new TableResponseDto(table));
    return new PaginatedTableResponseDto(tableDtos, total, page, limit);
  }

  /**
   * Obtener mesa por ID
   */
  async findById(id: string): Promise<TableResponseDto> {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: {
        area: {
          select: { name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    return new TableResponseDto(table);
  }

  /**
   * Actualizar mesa
   */
  async update(
    id: string,
    updateTableDto: UpdateTableDto,
  ): Promise<TableResponseDto> {
    // Verificar que la mesa existe
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    // Si está cambiando el área, validar que el área existe
    if (updateTableDto.areaId && updateTableDto.areaId !== table.areaId) {
      const area = await this.prisma.area.findUnique({
        where: { id: updateTableDto.areaId },
      });

      if (!area || area.deletedAt) {
        throw new NotFoundException(
          `Area with ID ${updateTableDto.areaId} not found`,
        );
      }
    }

    // Si está cambiando el número o el área, validar que la combinación sea única
    const newAreaId = updateTableDto.areaId || table.areaId!;
    const newNumber = updateTableDto.number ?? table.number;

    if (newNumber !== table.number || newAreaId !== table.areaId) {
      const existingTable = await this.prisma.table.findUnique({
        where: {
          areaId_number: {
            areaId: newAreaId,
            number: newNumber,
          },
        },
      });

      if (
        existingTable &&
        existingTable.id !== id &&
        !existingTable.deletedAt
      ) {
        throw new ConflictException(
          `Table number ${newNumber} already exists in area ${newAreaId}`,
        );
      }
    }

    // Actualizar mesa
    const updatedTable = await this.prisma.table.update({
      where: { id },
      data: updateTableDto,
      include: {
        area: {
          select: { name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    return new TableResponseDto(updatedTable);
  }

  /**
   * Cambiar estado de la mesa
   */
  async changeStatus(
    id: string,
    changeStatusDto: ChangeTableStatusDto,
  ): Promise<TableResponseDto> {
    // Verificar que la mesa existe
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    // Actualizar estado
    const updatedTable = await this.prisma.table.update({
      where: { id },
      data: { status: changeStatusDto.status },
      include: {
        area: {
          select: { name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    return new TableResponseDto(updatedTable);
  }

  /**
   * Desactivar/Eliminar mesa (soft delete)
   */
  async deactivate(id: string): Promise<TableResponseDto> {
    // Verificar que la mesa existe
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

    // Soft delete: establecer deletedAt e isActive = false
    const deletedTable = await this.prisma.table.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      include: {
        area: {
          select: { name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    return new TableResponseDto(deletedTable);
  }

  /**
   * Obtener mesas por área
   */
  async findByAreaId(areaId: string): Promise<TableResponseDto[]> {
    // Validar que el área existe
    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
    });

    if (!area) {
      throw new NotFoundException(`Area with ID ${areaId} not found`);
    }

    const tables = await this.prisma.table.findMany({
      where: {
        areaId,
        deletedAt: null,
      },
      include: {
        area: {
          select: { name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
      orderBy: { number: 'asc' },
    });

    return tables.map((table) => new TableResponseDto(table));
  }

  /**
   * Obtener estadísticas de mesas
   */
  async getStats(): Promise<any> {
    const [total, available, occupied, reserved, inactive] = await Promise.all([
      this.prisma.table.count({ where: { deletedAt: null } }),
      this.prisma.table.count({
        where: { deletedAt: null, status: 'AVAILABLE' },
      }),
      this.prisma.table.count({
        where: { deletedAt: null, status: 'OCCUPIED' },
      }),
      this.prisma.table.count({
        where: { deletedAt: null, status: 'RESERVED' },
      }),
      this.prisma.table.count({ where: { deletedAt: null, isActive: false } }),
    ]);

    return {
      total,
      available,
      occupied,
      reserved,
      inactive,
      occupancyRate: total > 0 ? ((occupied / total) * 100).toFixed(2) : 0,
    };
  }
}
