import { IsUUID, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  tableId: string; // Mesa donde se registra la orden (su área determina serviceType)

  @IsUUID()
  @IsNotEmpty()
  createdById: string; // Usuario que crea la orden (mesero/cajero)

  @IsUUID()
  @IsOptional()
  attendedById?: string; // Usuario que atiende (mesero principal)

  @IsOptional()
  initialItems?: Array<{
    productId: string;
    quantity: number;
    notes?: string;
  }>;
}
