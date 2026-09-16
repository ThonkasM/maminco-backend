import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

/**
 * OrdersGateway maneja eventos WebSocket en tiempo real para órdenes
 * 
 * Eventos emitidos:
 * - order:created → Nueva orden creada
 * - order:updated → Orden actualizada (descuento, propina)
 * - order:item:added → Item agregado a orden
 * - order:item:removed → Item eliminado de orden
 * - order:status:changed → Estado de orden cambió
 * - table:state:updated → Estado completo de la mesa actualizado (IMPORTANTE: incluye toda la orden)
 */
@WebSocketGateway({
    namespace: 'orders',
    cors: {
        origin: '*',
        credentials: true,
    },
})
@Injectable()
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private logger = new Logger('OrdersGateway');
    private userConnections = new Map<string, Set<string>>(); // userId -> Set<socketId>
    private jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    /**
     * Manejador de conexión
     * Valida JWT y asocia usuario a la conexión
     */
    async handleConnection(socket: Socket) {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                this.logger.warn('Conexión rechazada: sin token');
                socket.disconnect();
                return;
            }

            // Verificar JWT usando jsonwebtoken directamente
            const payload = jwt.verify(token, this.jwtSecret) as any;
            const userId = payload.sub;
            const userName = payload.name;

            // Asociar usuario a socket
            socket.data.userId = userId;
            socket.data.userName = userName;

            // Registrar conexión del usuario
            if (!this.userConnections.has(userId)) {
                this.userConnections.set(userId, new Set());
            }
            this.userConnections.get(userId)?.add(socket.id);

            this.logger.log(
                `✅ Usuario conectado: ${userName} (${userId}) - Socket: ${socket.id}`,
            );
        } catch (error) {
            this.logger.error(`❌ Error en conexión: ${error.message}`);
            socket.disconnect();
        }
    }

    /**
     * Manejador de desconexión
     */
    handleDisconnect(socket: Socket) {
        const userId = socket.data.userId;
        const userName = socket.data.userName;

        if (userId) {
            const connections = this.userConnections.get(userId);
            if (connections) {
                connections.delete(socket.id);
                if (connections.size === 0) {
                    this.userConnections.delete(userId);
                }
            }
            this.logger.log(`❌ Usuario desconectado: ${userName} (${userId})`);
        }
    }

    /**
     * Emitir evento cuando se crea una orden
     * @param tableId ID de la mesa
     * @param order Datos de la orden
     */
    emitOrderCreated(tableId: string, order: any) {
        const room = `table-${tableId}`;
        this.server.to(room).emit('order:created', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            tableId,
            createdByName: order.createdByName,
            status: order.status,
            createdAt: order.createdAt,
        });
        this.logger.log(`📢 [order:created] Mesa ${tableId} - Orden ${order.orderNumber}`);
    }

    /**
     * Emitir evento cuando se agrega un item a una orden
     * @param orderId ID de la orden
     * @param tableId ID de la mesa
     * @param item Item agregado
     */
    emitOrderItemAdded(orderId: string, tableId: string, item: any) {
        const room = `table-${tableId}`;
        this.server.to(room).emit('order:item:added', {
            orderId,
            tableId,
            itemId: item.id,
            productName: item.productName,
            quantity: item.quantity,
            addedByName: item.addedByName,
            unitPrice: item.unitPrice,
        });
        this.logger.log(
            `📢 [order:item:added] Mesa ${tableId} - Item: ${item.productName} (${item.quantity}x) por ${item.addedByName}`,
        );
    }

    /**
     * Emitir evento cuando se elimina un item de una orden
     * @param orderId ID de la orden
     * @param tableId ID de la mesa
     * @param itemId ID del item eliminado
     * @param productName Nombre del producto
     */
    emitOrderItemRemoved(
        orderId: string,
        tableId: string,
        itemId: string,
        productName: string,
    ) {
        const room = `table-${tableId}`;
        this.server.to(room).emit('order:item:removed', {
            orderId,
            tableId,
            itemId,
            productName,
        });
        this.logger.log(
            `📢 [order:item:removed] Mesa ${tableId} - Item eliminado: ${productName}`,
        );
    }

    /**
     * Emitir evento cuando se actualiza cantidad de un item
     * @param orderId ID de la orden
     * @param tableId ID de la mesa
     * @param itemId ID del item
     * @param quantity Nueva cantidad
     * @param subtotal Nuevo subtotal
     * @param updatedByName Nombre de quien actualizó
     */
    emitOrderItemUpdated(
        orderId: string,
        tableId: string,
        itemId: string,
        quantity: number,
        subtotal: number,
        updatedByName: string,
    ) {
        const room = `table-${tableId}`;
        this.server.to(room).emit('order:item:updated', {
            orderId,
            tableId,
            itemId,
            quantity,
            subtotal,
            updatedByName,
        });
        this.logger.log(
            `📢 [order:item:updated] Mesa ${tableId} - Item ${itemId}: cantidad=${quantity}, subtotal=${subtotal}`,
        );
    }

    /**
     * Emitir evento cuando cambia el estado de una orden
     * @param orderId ID de la orden
     * @param tableId ID de la mesa
     * @param newStatus Nuevo estado
     */
    emitOrderStatusChanged(orderId: string, tableId: string, newStatus: string) {
        const room = `table-${tableId}`;
        this.server.to(room).emit('order:status:changed', {
            orderId,
            tableId,
            newStatus,
        });
        this.logger.log(
            `📢 [order:status:changed] Mesa ${tableId} - Nuevo estado: ${newStatus}`,
        );
    }

    /**
     * Emitir evento cuando se actualiza descuento o propina
     * @param orderId ID de la orden
     * @param tableId ID de la mesa
     * @param total Total actualizado
     * @param discountAmount Descuento
     * @param tipAmount Propina
     */
    emitOrderUpdated(
        orderId: string,
        tableId: string,
        total: number,
        discountAmount: number,
        tipAmount: number,
    ) {
        const room = `table-${tableId}`;
        this.server.to(room).emit('order:updated', {
            orderId,
            tableId,
            total,
            discountAmount,
            tipAmount,
        });
        this.logger.log(`📢 [order:updated] Mesa ${tableId} - Total: ${total}`);
    }

    /**
     * Emitir estado completo de la mesa
     * Incluye toda la orden actual con todos sus items y totales
     * @param tableId ID de la mesa
     * @param tableState Estado completo de la mesa (OrderResponseDto)
     */
    emitTableStateUpdated(tableId: string, tableState: any) {
        const room = `table-${tableId}`;
        this.server.to(room).emit('table:state:updated', {
            tableId,
            orderState: tableState, // Incluye todo: items, totales, usuarios, etc.
            timestamp: new Date().toISOString(),
        });
        this.logger.log(
            `📊 [table:state:updated] Mesa ${tableId} - Total: ${tableState?.total || 0}`,
        );
    }

    /**
     * Emitir cambio de estado de mesa (DISPONIBLE, OCUPADA, RESERVADA)
     * Se broadcast a todos los usuarios conectados
     * @param tableId ID de la mesa
     * @param tableStatus Nuevo estado de la mesa
     * @param tableData Información de la mesa
     */
    emitTableStatusChanged(tableId: string, tableStatus: string, tableData: any) {
        // Broadcast global: todos los usuarios ven el cambio
        this.server.emit('tables:status:changed', {
            tableId,
            status: tableStatus,
            tableName: tableData.tableName || `Mesa ${tableData.number}`,
            areaId: tableData.areaId,
            areaName: tableData.areaName,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(
            `📊 [tables:status:changed] Mesa ${tableId} - Estado: ${tableStatus}`,
        );
    }

    /**
     * Emitir snapshot de todas las mesas en tiempo real
     * Usado cuando un usuario se conecta o para actualizaciones periódicas
     * @param tablesState Array con el estado de todas las mesas
     */
    emitAllTablesState(tablesState: any[]) {
        this.server.emit('tables:state:snapshot', {
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
        this.logger.log(
            `📋 [tables:state:snapshot] ${tablesState.length} mesas sincronizadas`,
        );
    }

    /**
     * Comando del cliente: unirse a sala de mesa
     * Evento: join:table
     * @param tableId ID de la mesa a monitorear
     */
    @SubscribeMessage('join:table')
    handleJoinTable(socket: Socket, tableId: string) {
        const room = `table-${tableId}`;
        socket.join(room);
        this.logger.log(
            `👤 ${socket.data.userName} se unió a mesa ${tableId} - Sala: ${room}`,
        );
    }

    /**
     * Comando del cliente: dejar sala de mesa
     * Evento: leave:table
     * @param tableId ID de la mesa
     */
    @SubscribeMessage('leave:table')
    handleLeaveTable(socket: Socket, tableId: string) {
        const room = `table-${tableId}`;
        socket.leave(room);
        this.logger.log(
            `👤 ${socket.data.userName} dejó mesa ${tableId} - Sala: ${room}`,
        );
    }

    /**
     * Comando del cliente: suscribirse a cambios de estado de TODAS las mesas
     * Evento: subscribe:tables:status
     * Usuario recibe: tables:status:changed, tables:state:snapshot
     */
    @SubscribeMessage('subscribe:tables:status')
    handleSubscribeTablesStatus(socket: Socket) {
        socket.join('tables:status');
        this.logger.log(
            `👤 ${socket.data.userName} suscrito a cambios de estado de mesas`,
        );
    }

    /**
     * Comando del cliente: desuscribirse de cambios de estado de mesas
     * Evento: unsubscribe:tables:status
     */
    @SubscribeMessage('unsubscribe:tables:status')
    handleUnsubscribeTablesStatus(socket: Socket) {
        socket.leave('tables:status');
        this.logger.log(
            `👤 ${socket.data.userName} desuscrito de cambios de estado de mesas`,
        );
    }
}

