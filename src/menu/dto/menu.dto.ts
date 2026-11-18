import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SetAvailabilityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  productIds: string[];

  @IsBoolean()
  isAvailable: boolean;
}

export class UpdateMenuNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}
