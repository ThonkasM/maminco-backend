import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AskDto {
  @IsString()
  @Length(3, 500)
  question: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;
}

export class VoiceCommandDto {
  @IsString()
  @Length(2, 400)
  transcript: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  tableNumber?: number;

  @IsOptional()
  @IsUUID()
  areaId?: string;
}

export class VoiceConfirmDto {
  @IsUUID()
  token: string;
}
