import { Category } from '@prisma/client';

type CategorySource = Pick<
  Category,
  'id' | 'name' | 'description' | 'isActive' | 'createdAt' | 'updatedAt'
>;

export class CategoryResponseDto {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  productsCount?: number; // Cantidad de productos en la categoría

  constructor(category: CategorySource, productsCount?: number) {
    this.id = category.id;
    this.name = category.name;
    this.description = category.description ?? undefined;
    this.isActive = category.isActive;
    this.createdAt = category.createdAt;
    this.updatedAt = category.updatedAt;
    if (productsCount !== undefined) {
      this.productsCount = productsCount;
    }
  }
}
