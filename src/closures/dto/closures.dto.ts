import { IsBoolean, IsOptional, Matches } from 'class-validator';

export class RunClosureDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe tener formato YYYY-MM-DD',
  })
  date: string;

  @IsOptional()
  @IsBoolean()
  acknowledgeEarly?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeOpenOrders?: boolean;
}
