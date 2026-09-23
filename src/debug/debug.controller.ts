import { Controller, Post, UseGuards, Request } from '@nestjs/common';
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
      message: 'Token válido',
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
    };
  }
}
