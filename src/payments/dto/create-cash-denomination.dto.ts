import {
  IsNumber,
  IsString,
  IsNotEmpty,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateCashDenominationDto {
  @IsNumber()
  @Min(0.01)
  @Max(10000)
  value: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['COIN', 'BILL'])
  type: string;
}
