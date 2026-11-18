import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersGateway } from './orders.gateway';
import { PrintingModule } from '../printing/printing.module';
import { AuthModule } from '../auth/auth.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { OrdersQueryService } from './application/orders-query.service';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { ChangeOrderStatusUseCase } from './application/use-cases/change-order-status.use-case';
import { ChangeKitchenStatusUseCase } from './application/use-cases/change-kitchen-status.use-case';
import { AddOrderItemUseCase } from './application/use-cases/add-order-item.use-case';
import { RemoveOrderItemUseCase } from './application/use-cases/remove-order-item.use-case';
import { UpdateOrderItemUseCase } from './application/use-cases/update-order-item.use-case';
import { ApplyDiscountUseCase } from './application/use-cases/apply-discount.use-case';
import { AddTipUseCase } from './application/use-cases/add-tip.use-case';
import { ORDER_REPOSITORY } from './application/ports/order.repository';
import { BUSINESS_CALENDAR } from './application/ports/business-calendar';
import { ReportsBusinessCalendar } from './infrastructure/reports-business-calendar';
import { ReportsModule } from '../reports/reports.module';
import { ORDER_QUERY_REPOSITORY } from './application/ports/order-query.repository';
import { ORDER_EVENTS_PUBLISHER } from './application/ports/order-events.publisher';
import { ORDER_RECEIPT_PRINTER } from './application/ports/order-receipt.printer';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { PrismaOrderQueryRepository } from './infrastructure/prisma-order-query.repository';
import { SocketOrderEventsPublisher } from './infrastructure/socket-order-events.publisher';
import { PrintingOrderReceiptPrinter } from './infrastructure/printing-order-receipt.printer';

@Module({
  imports: [PrintingModule, AuthModule, FeatureFlagsModule, ReportsModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [
    OrdersGateway,
    OrdersQueryService,
    CreateOrderUseCase,
    ChangeOrderStatusUseCase,
    ChangeKitchenStatusUseCase,
    AddOrderItemUseCase,
    RemoveOrderItemUseCase,
    UpdateOrderItemUseCase,
    ApplyDiscountUseCase,
    AddTipUseCase,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: ORDER_QUERY_REPOSITORY, useClass: PrismaOrderQueryRepository },
    { provide: BUSINESS_CALENDAR, useClass: ReportsBusinessCalendar },
    { provide: ORDER_EVENTS_PUBLISHER, useClass: SocketOrderEventsPublisher },
    { provide: ORDER_RECEIPT_PRINTER, useClass: PrintingOrderReceiptPrinter },
  ],
  exports: [
    OrdersGateway,
    OrdersQueryService,
    CreateOrderUseCase,
    AddOrderItemUseCase,
    UpdateOrderItemUseCase,
    RemoveOrderItemUseCase,
    ORDER_REPOSITORY,
    ORDER_EVENTS_PUBLISHER,
  ],
})
export class OrdersModule {}
