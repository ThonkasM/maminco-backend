import {
    Controller,
    Get,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Controlador administrativo para acceso a órdenes
 * Proporciona rutas bajo /api/admin/orders/ con protección de roles
 * Solo accesible para ADMINISTRADOR y GERENTE
 */
@Controller('api/admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminOrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    /**
     * GET /api/admin/orders/:id/history
     * Obtiene el historial completo de una orden con todos los detalles
     * Incluye: quién hizo qué, cuándo, y metadata del cambio
     * Roles permitidos: GERENTE, ADMINISTRADOR
     * Query params: page (default: 1), limit (default: 50, max: 500)
     */
    @Get(':id/history')
    @Roles('GERENTE', 'ADMINISTRADOR')
    async getOrderHistory(
        @Param('id') id: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '50',
    ) {
        return this.ordersService.getOrderHistory(
            id,
            Math.max(1, parseInt(page) || 1),
            Math.max(1, Math.min(500, parseInt(limit) || 50)),
        );
    }

    /**
     * GET /api/admin/orders/:id/history/timeline
     * Obtiene timeline visual simplificado de una orden
     * Formato: emoji + acción legible, ideal para UI de auditoría
     * Roles permitidos: GERENTE, ADMINISTRADOR
     * Query params: page (default: 1), limit (default: 50, max: 500)
     * 
     * Ejemplo:
     * GET /api/admin/orders/550e8400-e29b-41d4-a716-446655440000/history/timeline
     * 
     * Respuesta:
     * {
     *   "id": "550e8400-e29b-41d4-a716-446655440000",
     *   "orderNumber": "ORD-2025-001",
     *   "timeline": [
     *     {
     *       "emoji": "📝",
     *       "action": "Orden creada",
     *       "detail": "Mesa 5 - Comedor",
     *       "user": "Juan Pérez",
     *       "timestamp": "10:00:00"
     *     },
     *     {
     *       "emoji": "➕",
     *       "action": "Agregado",
     *       "detail": "PATO CRIOLLO x2",
     *       "user": "Juan Pérez",
     *       "timestamp": "10:05:30"
     *     }
     *   ],
     *   "pagination": {
     *     "page": 1,
     *     "limit": 50,
     *     "total": 127,
     *     "totalPages": 3,
     *     "hasNextPage": true,
     *     "hasPreviousPage": false
     *   }
     * }
     */
    @Get(':id/history/timeline')
    @Roles('GERENTE', 'ADMINISTRADOR')
    async getOrderHistoryTimeline(
        @Param('id') id: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '50',
    ) {
        return this.ordersService.getOrderHistoryTimeline(
            id,
            Math.max(1, parseInt(page) || 1),
            Math.max(1, Math.min(500, parseInt(limit) || 50)),
        );
    }
}
