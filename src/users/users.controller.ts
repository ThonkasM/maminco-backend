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
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ListUsersQueryDto,
  UserResponseDto,
  ResetPasswordDto,
  PaginatedResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  /**
   * Crear nuevo usuario
   * Solo administradores pueden crear usuarios
   */
  @Post()
  @Roles(UserRole.ADMINISTRATOR)
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  /**
   * Obtener lista de usuarios con paginación
   * Solo administradores pueden listar usuarios
   */
  @Get()
  @Roles(UserRole.ADMINISTRATOR)
  async findAll(
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(query);
  }

  /**
   * Obtener usuario por ID
   * Solo administradores pueden obtener detalles de usuarios
   */
  @Get(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  /**
   * Actualizar usuario
   * Solo administradores pueden actualizar usuarios
   */
  @Patch(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Desactivar usuario (soft delete)
   * Solo administradores pueden desactivar usuarios
   */
  @Delete(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.deactivate(id);
  }

  /**
   * Cambiar contraseña de un usuario (como administrador)
   * Solo administradores pueden resetear contraseñas
   */
  @Post(':id/reset-password')
  @Roles(UserRole.ADMINISTRATOR)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.usersService.resetPassword(id, resetPasswordDto);
  }
}
