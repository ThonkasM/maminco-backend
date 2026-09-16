import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        // Obtener los roles requeridos del decorador @Roles
        const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());

        // Si no hay roles requeridos, permitir acceso
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        // Obtener el usuario del request
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // Validar que el usuario exista
        if (!user) {
            throw new ForbiddenException('Usuario no autenticado');
        }

        // Validar que el usuario tenga uno de los roles requeridos
        const hasRole = requiredRoles.includes(user.role);

        if (!hasRole) {
            throw new ForbiddenException(
                `Acceso denegado. Roles requeridos: ${requiredRoles.join(', ')}`,
            );
        }

        return true;
    }
}
