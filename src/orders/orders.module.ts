import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';
import { PrintingModule } from '../printing/printing.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrintingModule, AuthModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService, OrdersGateway],
})
export class OrdersModule {}
