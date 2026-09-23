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
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({ namespace: '/payments' })
export class PaymentsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('PaymentsGateway');

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('WebSocket de pagos inicializado');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true, deletedAt: true },
      });

      if (!user || !user.isActive || user.deletedAt) {
        client.disconnect();
        return;
      }

      client.data.userId = user.id;
    } catch (error) {
      this.logger.warn(
        `Error en autenticación WS: ${error instanceof Error ? error.message : error}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
    this.logger.debug('Cliente desconectado de /payments');
  }

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
    this.server.to(`order-${orderId}`).emit('payment:processed', {
      orderId,
      tableId,
      ...data,
      timestamp: new Date(),
    });
  }

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
    this.server.to(`order-${orderId}`).emit('payment:refund', {
      orderId,
      tableId,
      ...data,
      timestamp: new Date(),
    });
  }

  emitTablePaymentStateUpdated(
    tableId: string,
    data: {
      totalOutstanding: number;
      totalPaid: number;
      pendingOrders: number;
      lastPaymentAt: Date;
    },
  ) {
    this.server.to(`table-${tableId}`).emit('payment:table-state', {
      tableId,
      ...data,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('joinOrder')
  handleJoinOrder(client: Socket, data: unknown) {
    const orderId = (data as { orderId?: unknown })?.orderId;
    if (typeof orderId !== 'string' || !orderId) return;
    client.join(`order-${orderId}`);
  }

  @SubscribeMessage('joinTable')
  handleJoinTable(client: Socket, data: unknown) {
    const tableId = (data as { tableId?: unknown })?.tableId;
    if (typeof tableId !== 'string' || !tableId) return;
    client.join(`table-${tableId}`);
  }
}
