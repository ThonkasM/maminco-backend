import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DebugModule } from './debug/debug.module';
import { AreasModule } from './areas/areas.module';
import { TablesModule } from './tables/tables.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrintingModule } from './printing/printing.module';
import { ReportsModule } from './reports/reports.module';


@Module({
  imports: [PrismaModule, AuthModule, UsersModule, DebugModule, AreasModule, TablesModule, CategoriesModule, ProductsModule, OrdersModule, PaymentsModule, PrintingModule, ReportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
