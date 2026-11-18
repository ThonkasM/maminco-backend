import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrderKitchenStatus } from '@prisma/client';

export class UpdateKitchenStatusDto {
  @IsEnum(OrderKitchenStatus)
  @IsNotEmpty()
  status: OrderKitchenStatus; // PENDING | PREPARING | READY
}
