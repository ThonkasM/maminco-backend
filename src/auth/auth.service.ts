import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Registrar un nuevo usuario
   *
   * Solo administradores pueden registrar usuarios
   * Se hashea la contraseña con bcrypt (salt: 10)
   */
  async register(registerDto: RegisterDto, adminId?: string) {
    const { email, password, name, role } = registerDto;

    // Si viene adminId, verificar que sea administrador
    if (adminId) {
      const admin = await this.prisma.user.findUnique({
        where: { id: adminId },
      });

      if (!admin || admin.role !== 'ADMINISTRADOR') {
        throw new ForbiddenException(
          'Solo administradores pueden registrar usuarios',
        );
      }
    }

    // Verificar si el usuario ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Generar JWT
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role },
      { expiresIn: '7d' },
    );

    return {
      accessToken,
      user,
    };
  }

  /**
   * Registrar el primer administrador
   *
   * Este método NO requiere autenticación previa
   * Solo funciona si no existe ningún usuario en la BD
   * Una vez registrado el primer admin, otros admins pueden registrar más usuarios
   */
  async registerFirstAdmin(registerFirstAdminDto: any) {
    const { email, password, name } = registerFirstAdminDto;

    // Verificar si ya existen usuarios
    const userCount = await this.prisma.user.count();

    if (userCount > 0) {
      throw new ForbiddenException(
        'Ya existe un administrador registrado. Use el endpoint /register para agregar más usuarios.',
      );
    }

    // Verificar si el email ya existe (redundante pero por seguridad)
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear primer administrador
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'ADMINISTRADOR',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Generar JWT
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role },
      { expiresIn: '7d' },
    );

    return {
      accessToken,
      user,
      message: '✅ Primer administrador registrado exitosamente',
    };
  }

  /**
   * Login de usuario
   *
   * Verifica email y contraseña
   * Solo usuarios activos (isActive = true) pueden acceder
   */
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Encontrar usuario por email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email inválido');
    }

    // Verificar que el usuario esté activo
    if (!user.isActive) {
      throw new ForbiddenException('Este usuario ha sido desactivado');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Contraseña inválida');
    }

    // Generar JWT
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role },
      { expiresIn: '7d' },
    );

    // Retornar sin el password
    const { password: _, ...userWithoutPassword } = user;

    return {
      accessToken,
      user: userWithoutPassword,
    };
  }

  /**
   * Obtener perfil del usuario autenticado
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        personal: {
          select: {
            id: true,
            name: true,
            phone: true,
            personalType: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Actualizar perfil del usuario
   *
   * Solo puede actualizar:
   * - name
   */
  async updateProfile(userId: string, updateData: { name?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: updateData.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  /**
   * Validar token JWT
   */
  validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  /**
   * Cambiar contraseña del usuario
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // Verificar contraseña anterior
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Contraseña anterior inválida');
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }
}
