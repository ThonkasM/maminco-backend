import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ListNodesQueryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateFolderDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class UploadFilesDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateNodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  /** `null` moves the node to the root. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;
}

export class FileUrlQueryDto {
  @IsOptional()
  @IsIn(['0', '1'])
  @Transform(({ value }: { value: unknown }) => String(value))
  download?: '0' | '1';
}
