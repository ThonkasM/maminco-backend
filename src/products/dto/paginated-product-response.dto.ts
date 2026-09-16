import { ProductResponseDto } from './product-response.dto';

export class PaginatedProductResponseDto {
    data: ProductResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
