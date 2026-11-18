import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrdersGateway } from '../orders.gateway';
import {
  OrderEvent,
  OrderEventsPublisher,
} from '../application/ports/order-events.publisher';
import { ORDER_QUERY_REPOSITORY } from '../application/ports/order-query.repository';
import type { OrderQueryRepository } from '../application/ports/order-query.repository';
import { OrderResponseDto } from '../dto';

const SNAPSHOT_DEBOUNCE_MS = 25;

@Injectable()
export class SocketOrderEventsPublisher implements OrderEventsPublisher {
  private readonly logger = new Logger(SocketOrderEventsPublisher.name);
  private tail: Promise<void> = Promise.resolve();
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly gateway: OrdersGateway,
    @Inject(ORDER_QUERY_REPOSITORY)
    private readonly queries: OrderQueryRepository,
  ) {}

  publish(event: OrderEvent): Promise<void> {
    this.tail = this.tail.then(() => this.safeDispatch(event));
    return Promise.resolve();
  }

  private safeDispatch(event: OrderEvent): void {
    try {
      this.dispatch(event);
    } catch (error) {
      this.logger.error(
        `No se pudo emitir ${event.type}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private dispatch(event: OrderEvent): void {
    const { order } = event;
    const tableId = order.tableId;

    switch (event.type) {
      case 'order.created':
        this.gateway.emitOrderCreated(tableId, order);
        this.gateway.emitTableStateUpdated(tableId, order);
        this.emitTableStatus(order, 'OCCUPIED');
        this.requestSnapshot();
        break;
      case 'order.status.changed':
        this.gateway.emitOrderStatusChanged(order.id, tableId, event.status);
        this.gateway.emitTableStateUpdated(tableId, order);
        if (event.tableReleased) this.emitTableStatus(order, 'AVAILABLE');
        this.requestSnapshot();
        break;
      case 'order.item.added':
        this.gateway.emitOrderItemAdded(order.id, tableId, event.item);
        this.gateway.emitTableStateUpdated(tableId, order);
        if (event.kitchenReset) {
          this.gateway.emitKitchenStatusChanged(order.id, tableId, 'PENDING');
        }
        break;
      case 'order.item.removed':
        this.gateway.emitOrderItemRemoved(
          order.id,
          tableId,
          event.itemId,
          event.productName,
        );
        this.gateway.emitTableStateUpdated(tableId, order);
        break;
      case 'order.item.updated':
        this.gateway.emitOrderItemUpdated(
          order.id,
          tableId,
          event.itemId,
          event.quantity,
          event.subtotal,
          event.updatedByName,
        );
        this.gateway.emitTableStateUpdated(tableId, order);
        break;
      case 'order.totals.updated':
        this.gateway.emitOrderUpdated(
          order.id,
          tableId,
          order.total,
          order.discountAmount,
          order.tipAmount,
        );
        this.gateway.emitTableStateUpdated(tableId, order);
        break;
      case 'order.kitchen-status.changed':
        this.gateway.emitKitchenStatusChanged(
          order.id,
          tableId,
          event.kitchenStatus,
        );
        break;
    }
  }

  private emitTableStatus(order: OrderResponseDto, status: string) {
    this.gateway.emitTableStatusChanged(order.tableId, status, {
      number: order.tableName,
      tableName: `Mesa ${order.tableName}`,
      areaId: order.areaId,
      areaName: order.serviceType,
    });
  }

  private requestSnapshot(): void {
    if (this.snapshotTimer) return;
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      void this.emitSnapshot();
    }, SNAPSHOT_DEBOUNCE_MS);
    this.snapshotTimer.unref();
  }

  private async emitSnapshot(): Promise<void> {
    try {
      this.gateway.emitAllTablesState(await this.queries.listTablesState());
    } catch (error) {
      this.logger.error(
        'No se pudo emitir el snapshot de mesas',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
