import { IsString, IsOptional, MinLength, IsBoolean } from 'class-validator';

export class UpdateAreaDto {
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Area name must be at least 2 characters' })
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isVirtual?: boolean;

  @IsOptional()
  isActive?: boolean;
}
