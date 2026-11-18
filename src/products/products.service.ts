import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  describeAvailability,
  describePriceChange,
} from '../notifications/domain/notification-rules';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
  ProductResponseDto,
  PaginatedProductResponseDto,
} from './dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    const existingProduct = await this.prisma.product.findFirst({
      where: {
        name: createProductDto.name,
        deletedAt: null, // No contar productos eliminados
      },
    });

    if (existingProduct) {
      throw new BadRequestException(
        `Ya existe un producto con el nombre "${createProductDto.name}"`,
      );
    }

    const category = await this.prisma.category.findUnique({
      where: { id: createProductDto.categoryId },
    });

    if (!category || !category.isActive) {
      throw new BadRequestException('La categoría no existe o no está activa');
    }

    if (createProductDto.stockGroupId) {
      const stockGroup = await this.prisma.stockGroup.findUnique({
        where: { id: createProductDto.stockGroupId },
      });

      if (!stockGroup || !stockGroup.isActive) {
        throw new BadRequestException(
          'El grupo de stock no existe o no está activo',
        );
      }

      if (
        createProductDto.individualStock !== undefined &&
        createProductDto.individualStock !== null
      ) {
        throw new BadRequestException(
          'No puede proporcionar tanto stockGroupId como individualStock. Elija uno u otro.',
        );
      }
    }

    const product = await this.prisma.product.create({
      data: {
        name: createProductDto.name,
        description: createProductDto.description,
        price: new Prisma.Decimal(createProductDto.price),
        categoryId: createProductDto.categoryId,
        stockGroupId: createProductDto.stockGroupId || null,
        individualStock: createProductDto.individualStock || null,
        isAvailable: true,
        isActive: true,
      },
      include: {
        category: true,
        stockGroup: true,
      },
    });

    return this.mapToProductResponse(product);
  }

  async findAll(
    query: ListProductsQueryDto,
  ): Promise<PaginatedProductResponseDto> {
    const {
      page = 1,
      limit = 10,
      search,
      categoryId,
      stockGroupId,
      isAvailable,
      hasIndividualStock,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (stockGroupId) {
      where.stockGroupId = stockGroupId;
    }

    if (isAvailable !== undefined) {
      where.isAvailable = isAvailable;
    }

    if (hasIndividualStock !== undefined) {
      if (hasIndividualStock) {
        where.individualStock = { not: null };
      } else {
        where.individualStock = null;
      }
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          stockGroup: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: products.map((product) => this.mapToProductResponse(product)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findById(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        stockGroup: true,
      },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.mapToProductResponse(product);
  }

  async findByCategory(
    categoryId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedProductResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          categoryId,
          deletedAt: null,
        },
        include: {
          category: true,
          stockGroup: true,
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({
        where: {
          categoryId,
          deletedAt: null,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: products.map((product) => this.mapToProductResponse(product)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (updateProductDto.name) {
      const existingProduct = await this.prisma.product.findFirst({
        where: {
          name: updateProductDto.name,
          id: { not: id }, // Excluir el producto actual
          deletedAt: null,
        },
      });

      if (existingProduct) {
        throw new BadRequestException(
          `Ya existe un producto con el nombre "${updateProductDto.name}"`,
        );
      }
    }

    if (updateProductDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateProductDto.categoryId },
      });

      if (!category || !category.isActive) {
        throw new BadRequestException(
          'La categoría no existe o no está activa',
        );
      }
    }

    if (updateProductDto.stockGroupId) {
      const stockGroup = await this.prisma.stockGroup.findUnique({
        where: { id: updateProductDto.stockGroupId },
      });

      if (!stockGroup || !stockGroup.isActive) {
        throw new BadRequestException(
          'El grupo de stock no existe o no está activo',
        );
      }
    }

    const updateData: Prisma.ProductUncheckedUpdateInput = {};

    if (updateProductDto.name !== undefined) {
      updateData.name = updateProductDto.name;
    }

    if (updateProductDto.description !== undefined) {
      updateData.description = updateProductDto.description;
    }

    if (updateProductDto.price !== undefined) {
      updateData.price = new Prisma.Decimal(updateProductDto.price);
    }

    if (updateProductDto.categoryId !== undefined) {
      updateData.categoryId = updateProductDto.categoryId;
    }

    if (updateProductDto.stockGroupId !== undefined) {
      updateData.stockGroupId = updateProductDto.stockGroupId;
    }

    if (updateProductDto.individualStock !== undefined) {
      updateData.individualStock = updateProductDto.individualStock;
    }

    if (updateProductDto.isAvailable !== undefined) {
      updateData.isAvailable = updateProductDto.isAvailable;
    }

    if (updateProductDto.isActive !== undefined) {
      updateData.isActive = updateProductDto.isActive;
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        stockGroup: true,
      },
    });

    this.notifyChanges(product, updatedProduct);

    return this.mapToProductResponse(updatedProduct);
  }

  private notifyChanges(
    before: { name: string; price: Prisma.Decimal; isAvailable: boolean },
    after: { name: string; price: Prisma.Decimal; isAvailable: boolean },
  ) {
    if (!before.price.equals(after.price)) {
      void this.notifications.publishAutomatic(
        'PRICE_UPDATE',
        describePriceChange(
          after.name,
          Number(before.price),
          Number(after.price),
        ),
      );
    }
    if (before.isAvailable !== after.isAvailable) {
      void this.notifications.publishAutomatic(
        'MENU_UPDATE',
        describeAvailability([after.name], after.isAvailable),
      );
    }
  }

  async setImage(id: string, file: Buffer): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }
    const imageKey = await this.media.saveProductImage(id, file);
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageKey },
      include: { category: true, stockGroup: true },
    });
    if (product.imageKey && product.imageKey !== imageKey) {
      await this.media.remove(product.imageKey);
    }
    return this.mapToProductResponse(updated);
  }

  async removeImage(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: { imageKey: null },
      include: { category: true, stockGroup: true },
    });
    await this.media.remove(product.imageKey);
    return this.mapToProductResponse(updated);
  }

  async deactivate(id: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }

    const deactivatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        isActive: false, // ✅ Ahora también establece isActive = false
        isAvailable: false, // ✅ No disponible cuando se desactiva
        deletedAt: new Date(),
      },
      include: {
        category: true,
        stockGroup: true,
      },
    });

    return this.mapToProductResponse(deactivatedProduct);
  }

  async getStats(): Promise<any> {
    const totalProducts = await this.prisma.product.count({
      where: { deletedAt: null },
    });

    const availableProducts = await this.prisma.product.count({
      where: { isAvailable: true, deletedAt: null },
    });

    const productsWithIndividualStock = await this.prisma.product.count({
      where: { individualStock: { not: null }, deletedAt: null },
    });

    const productsWithGroupStock = await this.prisma.product.count({
      where: { stockGroupId: { not: null }, deletedAt: null },
    });

    const categoryCounts = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null },
      _count: {
        id: true,
      },
    });

    return {
      totalProducts,
      availableProducts,
      unavailableProducts: totalProducts - availableProducts,
      productsWithIndividualStock,
      productsWithGroupStock,
      categoryCounts,
      availabilityRate:
        totalProducts > 0
          ? Math.round((availableProducts / totalProducts) * 100)
          : 0,
    };
  }

  async getAvailableProducts(
    categoryId?: string,
    search?: string,
    limit: number = 50,
  ): Promise<ProductResponseDto[]> {
    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      isActive: true,
      deletedAt: null,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        stockGroup: true,
      },
      take: limit,
      orderBy: { name: 'asc' },
    });

    return products.map((product) => this.mapToProductResponse(product));
  }

  async getProductAvailability(id: string): Promise<any> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        stockGroup: true,
      },
    });

    if (!product || product.deletedAt) {
      throw new NotFoundException('Producto no encontrado');
    }

    let availableStock: number | null = null;

    if (product.individualStock !== null) {
      availableStock = product.individualStock;
    } else if (product.stockGroupId && product.stockGroup) {
      availableStock = product.stockGroup.stock || 0;
    }

    return {
      id: product.id,
      name: product.name,
      isAvailable: product.isAvailable,
      isActive: product.isActive,
      stockType: product.individualStock !== null ? 'INDIVIDUAL' : 'GROUP',
      availableStock,
      groupName: product.stockGroup?.name,
      price: Number(product.price),
    };
  }

  private mapToProductResponse(
    product: Prisma.ProductGetPayload<{
      include: { category: true; stockGroup: true };
    }>,
  ): ProductResponseDto {
    return {
      id: product.id,
      name: product.name,
      description: product.description ?? undefined,
      price: Number(product.price),
      categoryId: product.categoryId,
      categoryName: product.category?.name || 'Sin categoría',
      stockGroupId: product.stockGroupId ?? undefined,
      stockGroupName: product.stockGroup?.name,
      individualStock: product.individualStock ?? undefined,
      isAvailable: product.isAvailable,
      imageKey: product.imageKey ?? undefined,
      image: this.media.urlsFor(product.imageKey),
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
