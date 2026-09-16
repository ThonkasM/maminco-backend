import { OrderResponseDto } from './order-response.dto';

export class PaginatedOrderResponseDto {
    data: OrderResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
