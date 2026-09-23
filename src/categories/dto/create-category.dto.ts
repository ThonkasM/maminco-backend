import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Category name must be at least 2 characters' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
