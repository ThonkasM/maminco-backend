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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ListCategoriesQueryDto,
  CategoryResponseDto,
  PaginatedCategoryResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  /**
   * Obtener todas las categorías activas (sin paginación)
   * Para usar en selects/dropdowns
   * Endpoint público - sin autenticación requerida
   */
  @Get('public/active')
  async getActiveCategories(): Promise<CategoryResponseDto[]> {
    return this.categoriesService.getAllActive();
  }

  /**
   * Crear nueva categoría
   * Solo administradores
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.create(createCategoryDto);
  }

  /**
   * Obtener lista de categorías con paginación
   * Solo administradores
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async findAll(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<PaginatedCategoryResponseDto<CategoryResponseDto>> {
    return this.categoriesService.findAll(query);
  }

  /**
   * Obtener categoría por ID
   * Solo administradores
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async findById(@Param('id') id: string): Promise<CategoryResponseDto> {
    return this.categoriesService.findById(id);
  }

  /**
   * Actualizar categoría
   * Solo administradores
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  /**
   * Desactivar categoría (soft delete)
   * Solo administradores
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMINISTRATOR)
  async deactivate(@Param('id') id: string): Promise<CategoryResponseDto> {
    return this.categoriesService.deactivate(id);
  }
}
