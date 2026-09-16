import { IsUUID, IsNotEmpty, IsInt, Min, IsOptional, IsString } from 'class-validator';

export class AddOrderItemDto {
    @IsUUID()
    @IsNotEmpty()
    productId: string; // Producto a agregar

    @IsInt()
    @Min(1)
    @IsNotEmpty()
    quantity: number; // Cantidad (mínimo 1)

    @IsString()
    @IsOptional()
    notes?: string; // Notas especiales (ej: "sin cebolla", "bien cocido")
}
