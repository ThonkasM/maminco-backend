import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateUserDto,
    UpdateUserDto,
    ListUsersQueryDto,
    UserResponseDto,
    ResetPasswordDto,
    PaginatedResponseDto,
} from './dto';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    /**
     * Crear nuevo usuario
     */
    async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
        // Validar que el email no exista
        const existingUser = await this.prisma.user.findUnique({
            where: { email: createUserDto.email },
        });

        if (existingUser) {
            throw new ConflictException(
                `User with email ${createUserDto.email} already exists`,
            );
        }

        // Hash la contraseña
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        // Crear usuario
        const user = await this.prisma.user.create({
            data: {
                email: createUserDto.email,
                name: createUserDto.name,
                password: hashedPassword,
                role: createUserDto.role,
            },
        });

        return new UserResponseDto(user);
    }

    /**
     * Obtener lista de usuarios con paginación
     */
    async findAll(
        query: ListUsersQueryDto,
    ): Promise<PaginatedResponseDto<UserResponseDto>> {
        const { page = 1, limit = 10, search } = query;
        const skip = (page - 1) * limit;

        const where: any = {
            deletedAt: null, // Solo usuarios no eliminados (soft delete)
            ...(search && {
                OR: [
                    { email: { contains: search, mode: 'insensitive' as const } },
                    { name: { contains: search, mode: 'insensitive' as const } },
                ],
            }),
        };

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    updatedAt: true,
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.user.count({ where }),
        ]);

        const userDtos = users.map((user) => new UserResponseDto(user));
        return new PaginatedResponseDto(userDtos, total, page, limit);
    }

    /**
     * Obtener usuario por ID
     */
    async findById(id: string): Promise<UserResponseDto> {
        const user = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!user || user.deletedAt) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        return new UserResponseDto(user);
    }

    /**
     * Actualizar usuario
     */
    async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
        // Verificar que el usuario existe
        const user = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!user || user.deletedAt) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        // Si está actualizando el email, verificar que no exista
        if (updateUserDto.email && updateUserDto.email !== user.email) {
            const existingUser = await this.prisma.user.findUnique({
                where: { email: updateUserDto.email },
            });

            if (existingUser) {
                throw new ConflictException(
                    `User with email ${updateUserDto.email} already exists`,
                );
            }
        }

        // Actualizar usuario
        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: updateUserDto,
        });

        return new UserResponseDto(updatedUser);
    }

    /**
     * Desactivar/Eliminar usuario (soft delete)
     */
    async deactivate(id: string): Promise<UserResponseDto> {
        // Verificar que el usuario existe
        const user = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!user || user.deletedAt) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        // Soft delete: establecer deletedAt y desactivar usuario
        const deletedUser = await this.prisma.user.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                isActive: false,
            },
        });

        return new UserResponseDto(deletedUser);
    }

    /**
     * Cambiar contraseña de un usuario (como administrador)
     */
    async resetPassword(
        id: string,
        resetPasswordDto: ResetPasswordDto,
    ): Promise<{ message: string }> {
        // Verificar que el usuario existe
        const user = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!user || user.deletedAt) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }

        // Hash la nueva contraseña
        const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);

        // Actualizar contraseña
        await this.prisma.user.update({
            where: { id },
            data: { password: hashedPassword },
        });

        return { message: `Password reset successfully for user ${user.email}` };
    }
}
