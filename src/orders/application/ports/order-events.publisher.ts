import { OrderResponseDto } from '../../dto';
import { KitchenStatusValue } from '../../domain/kitchen-status.machine';
import { OrderStatusValue } from '../../domain/order-status.machine';

export const ORDER_EVENTS_PUBLISHER = Symbol('ORDER_EVENTS_PUBLISHER');

export type OrderEvent =
  | { type: 'order.created'; order: OrderResponseDto }
  | {
      type: 'order.status.changed';
      order: OrderResponseDto;
      status: OrderStatusValue;
      tableReleased: boolean;
    }
  | {
      type: 'order.item.added';
      order: OrderResponseDto;
      item: {
        id: string;
        productName: string;
        quantity: number;
        addedByName: string;
        unitPrice: number;
      };
      kitchenReset: boolean;
    }
  | {
      type: 'order.item.removed';
      order: OrderResponseDto;
      itemId: string;
      productName: string;
    }
  | {
      type: 'order.item.updated';
      order: OrderResponseDto;
      itemId: string;
      quantity: number;
      subtotal: number;
      updatedByName: string;
    }
  | { type: 'order.totals.updated'; order: OrderResponseDto }
  | {
      type: 'order.kitchen-status.changed';
      order: OrderResponseDto;
      kitchenStatus: KitchenStatusValue;
    };

export interface OrderEventsPublisher {
  publish(event: OrderEvent): Promise<void>;
}
