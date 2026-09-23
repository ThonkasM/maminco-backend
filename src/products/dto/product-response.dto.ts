import { Decimal } from '@prisma/client/runtime/library';

export class ProductResponseDto {
  id: string;
  name: string;
  description?: string;
  price: Decimal;
  categoryId: string;
  categoryName: string; // Incluimos el nombre de la categoría
  stockGroupId?: string;
  stockGroupName?: string; // Nombre del grupo de stock si existe
  individualStock?: number; // Stock individual si existe
  isAvailable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
