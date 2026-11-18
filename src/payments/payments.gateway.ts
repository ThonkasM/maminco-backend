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
import { WsAuthService } from '../auth/ws-auth.service';

@WebSocketGateway({ namespace: '/payments' })
export class PaymentsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('PaymentsGateway');

  constructor(private readonly wsAuth: WsAuthService) {}

  afterInit(_server: Server) {
    this.logger.log('WebSocket de pagos inicializado');
  }

  async handleConnection(client: Socket) {
    try {
      const user = await this.wsAuth.authenticate(client);
      if (!user) {
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

  /** Number of clients currently connected to this namespace. */
  getConnectedClients(): number {
    const sockets = (
      this.server as unknown as { sockets?: Map<string, unknown> }
    )?.sockets;
    return sockets?.size ?? 0;
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
  async handleJoinOrder(client: Socket, data: unknown) {
    const orderId = (data as { orderId?: unknown })?.orderId;
    if (typeof orderId !== 'string' || !orderId) return;
    await client.join(`order-${orderId}`);
  }

  @SubscribeMessage('joinTable')
  async handleJoinTable(client: Socket, data: unknown) {
    const tableId = (data as { tableId?: unknown })?.tableId;
    if (typeof tableId !== 'string' || !tableId) return;
    await client.join(`table-${tableId}`);
  }
}
