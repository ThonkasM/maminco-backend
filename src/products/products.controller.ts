import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
  ProductResponseDto,
  PaginatedProductResponseDto,
} from './dto';

@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Obtener todos los productos disponibles (público)
   * Endpoint para obtener productos para el menú del cliente
   * Sin autenticación requerida
   */
  @Get('public/available')
  async getAvailableProducts(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string, // ✅ Agregado parámetro search
    @Query('limit') limit?: number,
  ): Promise<ProductResponseDto[]> {
    return this.productsService.getAvailableProducts(categoryId, search, limit);
  }

  /**
   * Obtener disponibilidad de stock de un producto
   * Endpoint público para verificar si hay stock disponible
   * Sin autenticación requerida
   */
  @Get('public/:id/availability') // ✅ Nuevo endpoint público
  async getProductAvailability(@Param('id') id: string): Promise<any> {
    return this.productsService.getProductAvailability(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR')
  create(
    @Body() createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.create(createProductDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR', 'GERENTE', 'CAJERO', 'MESERO')
  findAll(
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedProductResponseDto> {
    return this.productsService.findAll(query);
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR') // ✅ Ahora solo ADMINISTRADOR
  getStats(): Promise<any> {
    return this.productsService.getStats();
  }

  @Get('category/:categoryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR', 'GERENTE', 'CAJERO', 'MESERO')
  findByCategory(
    @Param('categoryId') categoryId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedProductResponseDto> {
    return this.productsService.findByCategory(categoryId, page, limit);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR', 'GERENTE', 'CAJERO', 'MESERO')
  findById(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR')
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRADOR')
  deactivate(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.productsService.deactivate(id);
  }
}
