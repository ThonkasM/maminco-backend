import { IsString, IsNotEmpty, IsInt, IsUUID, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTableDto {
    @Type(() => Number)
    @IsInt()
    @Min(0, { message: 'Table number must be >= 0' })
    @IsNotEmpty()
    number: number;

    @IsUUID()
    @IsNotEmpty()
    areaId: string; // UUID del área a la que pertenece la mesa
}
