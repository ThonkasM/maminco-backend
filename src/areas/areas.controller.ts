import { ParseUUIDPipe } from '@nestjs/common';
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
import { AreasService } from './areas.service';
import {
  CreateAreaDto,
  UpdateAreaDto,
  ListAreasQueryDto,
  AreaResponseDto,
  PaginatedAreaResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/areas')
export class AreasController {
  constructor(private areasService: AreasService) {}

  /**
   * Obtener todas las áreas activas (sin paginación)
   * Para usar en selects/dropdowns
   * Endpoint público - sin autenticación requerida
   */
  @Get('public/active')
  async getActiveAreas(): Promise<AreaResponseDto[]> {
    return this.areasService.getAllActive();
  }

  /**
   * Crear nueva área
   * Solo administradores pueden crear áreas
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async create(@Body() createAreaDto: CreateAreaDto): Promise<AreaResponseDto> {
    return this.areasService.create(createAreaDto);
  }

  /**
   * Obtener lista de áreas con paginación
   * Solo administradores pueden listar áreas
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async findAll(
    @Query() query: ListAreasQueryDto,
  ): Promise<PaginatedAreaResponseDto<AreaResponseDto>> {
    return this.areasService.findAll(query);
  }

  /**
   * Obtener área por ID
   * Solo administradores
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AreaResponseDto> {
    return this.areasService.findById(id);
  }

  /**
   * Actualizar área
   * Solo administradores
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAreaDto: UpdateAreaDto,
  ): Promise<AreaResponseDto> {
    return this.areasService.update(id, updateAreaDto);
  }

  /**
   * Desactivar área (soft delete)
   * Solo administradores
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AreaResponseDto> {
    return this.areasService.deactivate(id);
  }
}
