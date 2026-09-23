import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { AppLogger } from './app-logger.service';
import { AuthModule } from '../auth/auth.module';
import { PrintingModule } from '../printing/printing.module';
import { AiModule } from '../ai/ai.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
    imports: [
        AuthModule,
        PrintingModule,
        AiModule,
        OrdersModule,
        PaymentsModule,
    ],
    controllers: [SystemController],
    providers: [AppLogger, SystemService],
    exports: [AppLogger],
})
export class SystemModule {}
