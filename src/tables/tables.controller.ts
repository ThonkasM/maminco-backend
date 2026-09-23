import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  UpdateTableDto,
  ListTablesQueryDto,
  TableResponseDto,
  ChangeTableStatusDto,
  PaginatedTableResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TablesController {
  constructor(private tablesService: TablesService) {}

  /**
   * Crear nueva mesa
   * Solo administradores
   */
  @Post()
  @Roles(UserRole.ADMINISTRATOR)
  async create(
    @Body() createTableDto: CreateTableDto,
  ): Promise<TableResponseDto> {
    return this.tablesService.create(createTableDto);
  }

  /**
   * Obtener lista de mesas con paginación y filtros
   * Solo administradores
   */
  @Get()
  @Roles(UserRole.ADMINISTRATOR)
  async findAll(
    @Query() query: ListTablesQueryDto,
  ): Promise<PaginatedTableResponseDto<TableResponseDto>> {
    return this.tablesService.findAll(query);
  }

  /**
   * Obtener mesa por ID
   * Solo administradores
   */
  @Get(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async findById(@Param('id') id: string): Promise<TableResponseDto> {
    return this.tablesService.findById(id);
  }

  /**
   * Obtener mesas por área
   * Solo administradores
   */
  @Get('area/:areaId')
  @Roles(UserRole.ADMINISTRATOR)
  async findByAreaId(
    @Param('areaId') areaId: string,
  ): Promise<TableResponseDto[]> {
    return this.tablesService.findByAreaId(areaId);
  }

  /**
   * Actualizar mesa
   * Solo administradores
   */
  @Patch(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async update(
    @Param('id') id: string,
    @Body() updateTableDto: UpdateTableDto,
  ): Promise<TableResponseDto> {
    return this.tablesService.update(id, updateTableDto);
  }

  /**
   * Cambiar estado de la mesa (AVAILABLE, OCCUPIED, RESERVED)
   * Administradores pueden cambiar siempre
   * Meseros/Cajeros pueden cambiar para gestionar su trabajo
   */
  @Patch(':id/status')
  @Roles(
    UserRole.ADMINISTRATOR,
    UserRole.WAITER,
    UserRole.CASHIER,
    UserRole.MANAGER,
  )
  async changeStatus(
    @Param('id') id: string,
    @Body() changeStatusDto: ChangeTableStatusDto,
  ): Promise<TableResponseDto> {
    return this.tablesService.changeStatus(id, changeStatusDto);
  }

  /**
   * Desactivar mesa (soft delete)
   * Solo administradores
   */
  @Delete(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async deactivate(@Param('id') id: string): Promise<TableResponseDto> {
    return this.tablesService.deactivate(id);
  }

  /**
   * Obtener estadísticas de mesas
   * Solo administradores
   */
  @Get('stats/overview')
  @Roles(UserRole.ADMINISTRATOR)
  async getStats(): Promise<any> {
    return this.tablesService.getStats();
  }
}
