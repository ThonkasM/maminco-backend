import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentMethodsService } from './payment-methods.service';
import { CashDenominationsService } from './cash-denominations.service';
import { PaymentsController } from './payments.controller';
import { AdminPaymentController } from './admin-payment.controller';
import { PaymentsGateway } from './payments.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    PaymentsService,
    PaymentMethodsService,
    CashDenominationsService,
    PaymentsGateway,
  ],
  controllers: [PaymentsController, AdminPaymentController],
  exports: [
    PaymentsService,
    PaymentMethodsService,
    CashDenominationsService,
    PaymentsGateway,
  ],
})
export class PaymentsModule {}
