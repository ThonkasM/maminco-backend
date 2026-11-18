import { ConflictException, ForbiddenException } from '@nestjs/common';
import { OrderSnapshot } from './ports/order.repository';

export interface Actor {
  id: string;
  role?: string;
}

export function assertEditable(order: OrderSnapshot, action: string): void {
  if (order.status !== 'DRAFT') {
    throw new ForbiddenException(
      `No se pueden ${action} una orden ${order.status}`,
    );
  }
  if (order.paymentCount > 0) {
    throw new ConflictException(
      `No se pueden ${action} una orden con pagos registrados`,
    );
  }
}
