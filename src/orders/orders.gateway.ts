import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

interface SocketUser {
  id: string;
  name?: string;
  role?: string;
}

@WebSocketGateway({ namespace: 'orders' })
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('OrdersGateway');

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        socket.disconnect();
        return;
      }

      const payload = this.jwtService.verify<{ sub: string }>(token);
      if (!payload?.sub) {
        socket.disconnect();
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          name: true,
          role: true,
          isActive: true,
          deletedAt: true,
        },
      });

      if (!user || !user.isActive || user.deletedAt) {
        socket.disconnect();
        return;
      }

      const socketUser: SocketUser = {
        id: user.id,
        name: user.name,
        role: user.role,
      };
      socket.data.user = socketUser;
      this.logger.log(`Usuario conectado: ${user.name} (${user.id})`);
    } catch (error) {
      this.logger.warn(
        `Conexión rechazada: ${error instanceof Error ? error.message : error}`,
      );
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const user = socket.data.user as SocketUser | undefined;
    if (user) {
      this.logger.log(`Usuario desconectado: ${user.name} (${user.id})`);
    }
  }

  emitOrderCreated(tableId: string, order: any) {
    this.server.to(`table-${tableId}`).emit('order:created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableId,
      createdByName: order.createdByName,
      status: order.status,
      createdAt: order.createdAt,
    });
  }

  emitOrderItemAdded(orderId: string, tableId: string, item: any) {
    this.server.to(`table-${tableId}`).emit('order:item:added', {
      orderId,
      tableId,
      itemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      addedByName: item.addedByName,
      unitPrice: item.unitPrice,
    });
  }

  emitOrderItemRemoved(
    orderId: string,
    tableId: string,
    itemId: string,
    productName: string,
  ) {
    this.server.to(`table-${tableId}`).emit('order:item:removed', {
      orderId,
      tableId,
      itemId,
      productName,
    });
  }

  emitOrderItemUpdated(
    orderId: string,
    tableId: string,
    itemId: string,
    quantity: number,
    subtotal: number,
    updatedByName: string,
  ) {
    this.server.to(`table-${tableId}`).emit('order:item:updated', {
      orderId,
      tableId,
      itemId,
      quantity,
      subtotal,
      updatedByName,
    });
  }

  emitOrderStatusChanged(orderId: string, tableId: string, newStatus: string) {
    this.server.to(`table-${tableId}`).emit('order:status:changed', {
      orderId,
      tableId,
      newStatus,
    });
  }

  emitOrderUpdated(
    orderId: string,
    tableId: string,
    total: number,
    discountAmount: number,
    tipAmount: number,
  ) {
    this.server.to(`table-${tableId}`).emit('order:updated', {
      orderId,
      tableId,
      total,
      discountAmount,
      tipAmount,
    });
  }

  emitTableStateUpdated(tableId: string, tableState: any) {
    this.server.to(`table-${tableId}`).emit('table:state:updated', {
      tableId,
      orderState: tableState,
      timestamp: new Date().toISOString(),
    });
  }

  emitTableStatusChanged(tableId: string, tableStatus: string, tableData: any) {
    this.server.to('tables:status').emit('tables:status:changed', {
      tableId,
      status: tableStatus,
      tableName: tableData.tableName || `Mesa ${tableData.number}`,
      areaId: tableData.areaId,
      areaName: tableData.areaName,
      timestamp: new Date().toISOString(),
    });
  }

  emitAllTablesState(tablesState: any[]) {
    this.server.to('tables:status').emit('tables:state:snapshot', {
      tables: tablesState.map((table) => ({
        id: table.id,
        number: table.number,
        status: table.status,
        areaId: table.areaId,
        areaName: table.areaName,
        hasActiveOrder: table.hasActiveOrder,
        currentOrderTotal: table.currentOrderTotal,
        itemCount: table.itemCount,
        createdByName: table.createdByName,
      })),
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('join:table')
  handleJoinTable(socket: Socket, tableId: unknown) {
    if (typeof tableId !== 'string' || !tableId) return;
    socket.join(`table-${tableId}`);
  }

  @SubscribeMessage('leave:table')
  handleLeaveTable(socket: Socket, tableId: unknown) {
    if (typeof tableId !== 'string' || !tableId) return;
    socket.leave(`table-${tableId}`);
  }

  @SubscribeMessage('subscribe:tables:status')
  handleSubscribeTablesStatus(socket: Socket) {
    socket.join('tables:status');
  }

  @SubscribeMessage('unsubscribe:tables:status')
  handleUnsubscribeTablesStatus(socket: Socket) {
    socket.leave('tables:status');
  }
}
