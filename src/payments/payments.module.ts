import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentMethodsService } from './payment-methods.service';
import { CashDenominationsService } from './cash-denominations.service';
import { PaymentsController } from './payments.controller';
import { AdminPaymentController } from './admin-payment.controller';
import { PaymentsGateway } from './payments.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { ProcessPaymentUseCase } from './application/use-cases/process-payment.use-case';
import { PAYMENT_REPOSITORY } from './application/ports/payment.repository';
import { PAYMENT_EVENTS_PUBLISHER } from './application/ports/payment-events.publisher';
import { PrismaPaymentRepository } from './infrastructure/prisma-payment.repository';
import { SocketPaymentEventsPublisher } from './infrastructure/socket-payment-events.publisher';

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule],
  providers: [
    PaymentsService,
    PaymentMethodsService,
    CashDenominationsService,
    PaymentsGateway,
    ProcessPaymentUseCase,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    {
      provide: PAYMENT_EVENTS_PUBLISHER,
      useClass: SocketPaymentEventsPublisher,
    },
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
