import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Category name must be at least 2 characters' })
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  isActive?: boolean;
}
