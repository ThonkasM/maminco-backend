import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ShiftInputDto {
  @IsString()
  @MaxLength(40)
  name: string;

  @Matches(TIME, { message: 'start debe tener formato HH:MM' })
  start: string;

  @Matches(TIME, { message: 'end debe tener formato HH:MM' })
  end: string;
}

export class UpdateShiftsDto {
  @Matches(TIME, { message: 'businessDayStart debe tener formato HH:MM' })
  businessDayStart: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ShiftInputDto)
  shifts: ShiftInputDto[];
}
