import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { SocketUser, WsAuthService } from '../auth/ws-auth.service';
import { OrdersQueryService } from './application/orders-query.service';

import { OrderResponseDto } from './dto';
import type { TableState } from './application/ports/order-query.repository';

@WebSocketGateway({ namespace: 'orders' })
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('OrdersGateway');

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly ordersQuery: OrdersQueryService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const user = await this.wsAuth.authenticate(socket);
      if (!user) {
        socket.disconnect();
        return;
      }
      socket.data.user = user;
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

  /** Number of authenticated clients currently connected to this namespace. */
  getConnectedClients(): number {
    const sockets = (
      this.server as unknown as { sockets?: Map<string, unknown> }
    )?.sockets;
    return sockets?.size ?? 0;
  }

  emitOrderCreated(
    tableId: string,
    order: Pick<
      OrderResponseDto,
      'id' | 'orderNumber' | 'createdByName' | 'status' | 'createdAt'
    >,
  ) {
    const payload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableId,
      createdByName: order.createdByName,
      status: order.status,
      createdAt: order.createdAt,
    };
    this.server.to(`table-${tableId}`).emit('order:created', payload);
    this.server.to('kitchen').emit('order:created', payload);
  }

  emitOrderItemAdded(
    orderId: string,
    tableId: string,
    item: {
      id: string;
      productName: string;
      quantity: number;
      addedByName: string;
      unitPrice: number;
    },
  ) {
    const payload = {
      orderId,
      tableId,
      itemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      addedByName: item.addedByName,
      unitPrice: item.unitPrice,
    };
    this.server.to(`table-${tableId}`).emit('order:item:added', payload);
    this.server.to('kitchen').emit('order:item:added', payload);
  }

  emitOrderItemRemoved(
    orderId: string,
    tableId: string,
    itemId: string,
    productName: string,
  ) {
    const payload = { orderId, tableId, itemId, productName };
    this.server.to(`table-${tableId}`).emit('order:item:removed', payload);
    this.server.to('kitchen').emit('order:item:removed', payload);
  }

  emitOrderItemUpdated(
    orderId: string,
    tableId: string,
    itemId: string,
    quantity: number,
    subtotal: number,
    updatedByName: string,
  ) {
    const payload = {
      orderId,
      tableId,
      itemId,
      quantity,
      subtotal,
      updatedByName,
    };
    this.server.to(`table-${tableId}`).emit('order:item:updated', payload);
    this.server.to('kitchen').emit('order:item:updated', payload);
  }

  emitOrderStatusChanged(orderId: string, tableId: string, newStatus: string) {
    const payload = { orderId, tableId, newStatus };
    this.server.to(`table-${tableId}`).emit('order:status:changed', payload);
    this.server.to('kitchen').emit('order:status:changed', payload);
  }

  emitKitchenStatusChanged(
    orderId: string,
    tableId: string,
    kitchenStatus: string,
  ) {
    const payload = { orderId, tableId, kitchenStatus };
    this.server.to('kitchen').emit('order:kitchen-status:changed', payload);
    this.server
      .to(`table-${tableId}`)
      .emit('order:kitchen-status:changed', payload);
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

  emitTableStateUpdated(
    tableId: string,
    tableState: OrderResponseDto | TableState,
  ) {
    this.server.to(`table-${tableId}`).emit('table:state:updated', {
      tableId,
      orderState: tableState,
      timestamp: new Date().toISOString(),
    });
  }

  emitTableStatusChanged(
    tableId: string,
    tableStatus: string,
    tableData: {
      number?: number | string;
      tableName?: string;
      areaId?: string;
      areaName?: string;
    },
  ) {
    this.server.to('tables:status').emit('tables:status:changed', {
      tableId,
      status: tableStatus,
      tableName: tableData.tableName || `Mesa ${tableData.number}`,
      areaId: tableData.areaId,
      areaName: tableData.areaName,
      timestamp: new Date().toISOString(),
    });
  }

  emitAllTablesState(tablesState: TableState[]) {
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
  async handleJoinTable(socket: Socket, tableId: unknown) {
    if (typeof tableId !== 'string' || !tableId) return;
    await socket.join(`table-${tableId}`);
  }

  @SubscribeMessage('leave:table')
  async handleLeaveTable(socket: Socket, tableId: unknown) {
    if (typeof tableId !== 'string' || !tableId) return;
    await socket.leave(`table-${tableId}`);
  }

  @SubscribeMessage('subscribe:tables:status')
  async handleSubscribeTablesStatus(socket: Socket) {
    await socket.join('tables:status');
    // Send the current state to the newly subscribed client. Non-admin roles
    // (manager, cashier, waiter) cannot read `GET /api/tables`, so this initial
    // snapshot is their only source for the table list.
    try {
      const tables = await this.ordersQuery.getAllTablesState();
      socket.emit('tables:state:snapshot', {
        tables,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el snapshot inicial de mesas',
        error as Error,
      );
    }
  }

  @SubscribeMessage('unsubscribe:tables:status')
  async handleUnsubscribeTablesStatus(socket: Socket) {
    await socket.leave('tables:status');
  }

  @SubscribeMessage('subscribe:kitchen')
  async handleSubscribeKitchen(socket: Socket) {
    await socket.join('kitchen');
    try {
      const orders = await this.ordersQuery.getKitchenOrders();
      socket.emit('kitchen:orders:snapshot', {
        orders,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        'No se pudo enviar el snapshot inicial de cocina',
        error as Error,
      );
    }
  }

  @SubscribeMessage('unsubscribe:kitchen')
  async handleUnsubscribeKitchen(socket: Socket) {
    await socket.leave('kitchen');
  }
}
