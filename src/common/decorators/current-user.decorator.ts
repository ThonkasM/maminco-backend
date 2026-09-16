import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorador @CurrentUser()
 * 
 * Extrae el usuario autenticado del request y lo pasa como parámetro
 * al controlador/servicio.
 * 
 * Uso:
 * ```
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: any) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);
