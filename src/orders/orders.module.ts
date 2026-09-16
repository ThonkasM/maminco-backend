import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { PrintingModule } from '../printing/printing.module';

@Module({
    imports: [PrintingModule],
    controllers: [OrdersController, AdminOrdersController],
    providers: [OrdersService, OrdersGateway, PrismaService],
    exports: [OrdersService, OrdersGateway],
})
export class OrdersModule { }
