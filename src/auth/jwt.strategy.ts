import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
        });
    }

    /**
     * Validar el JWT y recuperar el usuario desde la BD
     * 
     * Este método es llamado automáticamente por Passport
     * cuando se usa @UseGuards(JwtAuthGuard)
     */
    async validate(payload: any) {
        console.log('🔐 JWT Strategy - Validando payload:', payload);

        // Si el payload no tiene 'sub', lanzar error
        if (!payload.sub) {
            console.error('❌ JWT Strategy - Payload sin ID:', payload);
            throw new UnauthorizedException('Token inválido: sin identificador de usuario');
        }

        // Validar que el usuario exista en la base de datos
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
            },
        });

        if (!user) {
            console.error('❌ JWT Strategy - Usuario no encontrado:', payload.sub);
            throw new UnauthorizedException('Usuario no encontrado');
        }

        // Validar que el usuario esté activo
        if (!user.isActive) {
            console.error('❌ JWT Strategy - Usuario inactivo:', user.email);
            throw new UnauthorizedException('Usuario desactivado');
        }

        // Retornar el usuario para que esté disponible en el request
        const userObj = {
            sub: user.id,
            email: user.email,
            id: user.id,
            name: user.name,
            role: user.role,
            isActive: user.isActive,
        };

        console.log('✅ JWT Strategy - Usuario validado:', userObj);
        return userObj;
    }
}
