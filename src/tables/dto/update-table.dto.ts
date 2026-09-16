import { IsOptional, IsInt, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTableDto {
    @Type(() => Number)
    @IsInt()
    @Min(0, { message: 'Table number must be >= 0' })
    @IsOptional()
    number?: number;

    @IsUUID()
    @IsOptional()
    areaId?: string;

    @IsOptional()
    isActive?: boolean;
}
