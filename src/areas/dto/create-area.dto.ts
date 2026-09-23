import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  IsBoolean,
} from 'class-validator';

export class CreateAreaDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Area name must be at least 2 characters' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isVirtual?: boolean = false;
}
