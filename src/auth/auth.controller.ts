import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterFirstAdminDto } from './dto/register-first-admin.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/register-first-admin
   * Registrar el primer administrador
   *
   * Sin autenticación requerida
   * Solo funciona si la BD está vacía de usuarios
   */
  @Post('register-first-admin')
  @HttpCode(HttpStatus.CREATED)
  async registerFirstAdmin(
    @Body() registerFirstAdminDto: RegisterFirstAdminDto,
  ) {
    return await this.authService.registerFirstAdmin(registerFirstAdminDto);
  }

  /**
   * POST /api/auth/register
   * Registrar un nuevo usuario
   *
   * Solo administradores pueden registrar usuarios
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async register(@Body() registerDto: RegisterDto, @CurrentUser() admin: any) {
    return await this.authService.register(registerDto, admin.id);
  }

  /**
   * POST /api/auth/login
   * Login de usuario con email y contraseña
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }

  /**
   * GET /api/auth/profile
   * Obtener el perfil del usuario autenticado
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: any) {
    return await this.authService.getProfile(user.sub);
  }

  /**
   * PATCH /api/auth/profile
   * Actualizar el perfil del usuario autenticado
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@CurrentUser() user: any, @Body() updateData: any) {
    return await this.authService.updateProfile(user.sub, updateData);
  }

  /**
   * POST /api/auth/change-password
   * Cambiar contraseña del usuario autenticado
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: any,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return await this.authService.changePassword(
      user.sub,
      body.oldPassword,
      body.newPassword,
    );
  }
}
