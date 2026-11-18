import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AreasModule } from './areas/areas.module';
import { TablesModule } from './tables/tables.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrintingModule } from './printing/printing.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { InsightsModule } from './insights/insights.module';
import { SystemModule } from './system/system.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClosuresModule } from './closures/closures.module';
import { RepositoryModule } from './repository/repository.module';
import { ShiftsModule } from './shifts/shifts.module';
import { MenuModule } from './menu/menu.module';
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AreasModule,
    TablesModule,
    CategoriesModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    PrintingModule,
    ReportsModule,
    AiModule,
    InsightsModule,
    SystemModule,
    FeatureFlagsModule,
    NotificationsModule,
    MenuModule,
    ShiftsModule,
    RepositoryModule,
    ClosuresModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
