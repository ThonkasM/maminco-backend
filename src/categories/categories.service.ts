import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ListCategoriesQueryDto,
  CategoryResponseDto,
  PaginatedCategoryResponseDto,
} from './dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const existingCategory = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });

    if (existingCategory) {
      throw new ConflictException(
        `Category with name "${createCategoryDto.name}" already exists`,
      );
    }

    const category = await this.prisma.category.create({
      data: {
        name: createCategoryDto.name,
        description: createCategoryDto.description,
      },
    });

    return new CategoryResponseDto(category);
  }

  async findAll(
    query: ListCategoriesQueryDto,
  ): Promise<PaginatedCategoryResponseDto<CategoryResponseDto>> {
    const { page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null, // Solo categorías no eliminadas
      ...(search && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
    };

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        include: {
          _count: {
            select: { products: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.category.count({ where }),
    ]);

    const categoryDtos = categories.map(
      (category) => new CategoryResponseDto(category, category._count.products),
    );
    return new PaginatedCategoryResponseDto(categoryDtos, total, page, limit);
  }

  async findById(id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return new CategoryResponseDto(category, category._count.products);
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existingCategory = await this.prisma.category.findUnique({
        where: { name: updateCategoryDto.name },
      });

      if (existingCategory) {
        throw new ConflictException(
          `Category with name "${updateCategoryDto.name}" already exists`,
        );
      }
    }

    const updatedCategory = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return new CategoryResponseDto(
      updatedCategory,
      (updatedCategory as any)._count?.products || 0,
    );
  }

  async deactivate(id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    const deletedCategory = await this.prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return new CategoryResponseDto(
      deletedCategory,
      (deletedCategory as any)._count?.products || 0,
    );
  }

  async getAllActive(): Promise<CategoryResponseDto[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        isActive: true,
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return categories.map(
      (category) => new CategoryResponseDto(category, category._count.products),
    );
  }
}
