import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/debug')
export class DebugController {
    /**
     * POST /api/debug/verify-token
     * Endpoint para verificar si el token es válido
     */
    @Post('verify-token')
    @UseGuards(JwtAuthGuard)
    verifyToken(@Request() req: any) {
        return {
            message: '✅ Token es válido',
            user: req.user,
        };
    }

    /**
     * GET /api/debug/headers
     * Ver qué headers se están recibiendo
     */
    @Get('headers')
    getHeaders(@Request() req: any) {
        return {
            authorization: req.headers.authorization,
            'content-type': req.headers['content-type'],
            allHeaders: Object.keys(req.headers),
        };
    }
}
