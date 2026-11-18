import {
  BadRequestException,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES } from '../media/domain/image-variants';
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

  @Get('public/available')
  async getAvailableProducts(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string, // ✅ Agregado parámetro search
    @Query('limit') limit?: number,
  ): Promise<ProductResponseDto[]> {
    return this.productsService.getAvailableProducts(categoryId, search, limit);
  }

  @Get('public/:id/availability') // ✅ Nuevo endpoint público
  async getProductAvailability(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<any> {
    return this.productsService.getProductAvailability(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  create(
    @Body() createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.create(createProductDto);
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProductResponseDto> {
    if (!file) throw new BadRequestException('Adjunta una imagen.');
    return this.productsService.setImage(id, file.buffer);
  }

  @Delete(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER')
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    return this.productsService.removeImage(id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  findAll(
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedProductResponseDto> {
    return this.productsService.findAll(query);
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR') // ✅ Ahora solo ADMINISTRATOR
  getStats(): Promise<any> {
    return this.productsService.getStats();
  }

  @Get('category/:categoryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  findByCategory(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedProductResponseDto> {
    return this.productsService.findByCategory(categoryId, page, limit);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    return this.productsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    return this.productsService.deactivate(id);
  }
}
