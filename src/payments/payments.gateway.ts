import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
    namespace: '/payments',
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    },
})
export class PaymentsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private logger: Logger = new Logger('PaymentsGateway');

    constructor(private jwtService: JwtService) { }

    afterInit(server: Server) {
        this.logger.log('💳 WebSocket Pagos Inicializado');
    }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                this.logger.warn(`❌ Cliente conectado sin token en /payments`);
                client.disconnect();
                return;
            }

            const decoded = this.jwtService.verify(token);
            this.logger.log(`✅ Usuario conectado en /payments: ${decoded.email}`);
        } catch (error) {
            this.logger.error(`❌ Error en autenticación: ${error.message}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`👋 Cliente desconectado de /payments`);
    }

    /**
     * Emite evento cuando un pago es procesado
     * Se envía a todos los clientes en la sala de la orden
     */
    emitPaymentProcessed(
        orderId: string,
        tableId: string,
        data: {
            paymentId: string;
            amount: number;
            method: string;
            changeAmount: number;
            tipAmount: number;
            isPaid: boolean;
            paidBy: string;
        },
    ) {
        const roomName = `order-${orderId}`;
        this.server.to(roomName).emit('payment:processed', {
            orderId,
            tableId,
            ...data,
            timestamp: new Date(),
        });

        this.logger.log(
            `💰 Pago emitido: $${data.amount} - Orden: ${orderId} - Cambio: $${data.changeAmount}`,
        );
    }

    /**
     * Emite evento cuando un reembolso es procesado
     */
    emitRefundProcessed(
        orderId: string,
        tableId: string,
        data: {
            refundId: string;
            amount: number;
            reason: string;
            processedBy: string;
        },
    ) {
        const roomName = `order-${orderId}`;
        this.server.to(roomName).emit('payment:refund', {
            orderId,
            tableId,
            ...data,
            timestamp: new Date(),
        });

        this.logger.log(
            `🔄 Reembolso emitido: $${data.amount} - Orden: ${orderId}`,
        );
    }

    /**
     * Emite evento cuando cambia el estado de pagos de una mesa
     */
    emitTablePaymentStateUpdated(
        tableId: string,
        data: {
            totalOutstanding: number;
            totalPaid: number;
            pendingOrders: number;
            lastPaymentAt: Date;
        },
    ) {
        const roomName = `table-${tableId}`;
        this.server.to(roomName).emit('payment:table-state', {
            tableId,
            ...data,
            timestamp: new Date(),
        });

        this.logger.log(
            `📊 Estado de pagos actualizado - Mesa: ${tableId}`,
        );
    }

    /**
     * Permite a un cliente unirse a una sala de orden
     */
    @SubscribeMessage('joinOrder')
    handleJoinOrder(
        client: Socket,
        data: { orderId: string; tableId: string },
    ) {
        const roomName = `order-${data.orderId}`;
        client.join(roomName);
        this.logger.log(
            `✅ Cliente unido a sala: ${roomName}`,
        );
    }

    /**
     * Permite a un cliente unirse a una sala de mesa
     */
    @SubscribeMessage('joinTable')
    handleJoinTable(client: Socket, data: { tableId: string }) {
        const roomName = `table-${data.tableId}`;
        client.join(roomName);
        this.logger.log(
            `✅ Cliente unido a sala: ${roomName}`,
        );
    }
}
