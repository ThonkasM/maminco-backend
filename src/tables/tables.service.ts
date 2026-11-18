import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  async create(createTableDto: CreateTableDto): Promise<TableResponseDto> {
    const area = await this.prisma.area.findUnique({
      where: { id: createTableDto.areaId },
    });

    if (!area || area.deletedAt) {
      throw new NotFoundException(
        `Area with ID ${createTableDto.areaId} not found`,
      );
    }

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

  async update(
    id: string,
    updateTableDto: UpdateTableDto,
  ): Promise<TableResponseDto> {
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }

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

  async changeStatus(
    id: string,
    changeStatusDto: ChangeTableStatusDto,
  ): Promise<TableResponseDto> {
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }
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

  async deactivate(id: string): Promise<TableResponseDto> {
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table || table.deletedAt) {
      throw new NotFoundException(`Table with ID ${id} not found`);
    }
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

  async findByAreaId(areaId: string): Promise<TableResponseDto[]> {
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
