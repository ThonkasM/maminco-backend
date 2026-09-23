import { IsEnum, IsNotEmpty } from 'class-validator';
import { TableStatus } from '@prisma/client';

export class ChangeTableStatusDto {
  @IsEnum(TableStatus, {
    message: `Status must be one of: ${Object.values(TableStatus).join(', ')}`,
  })
  @IsNotEmpty()
  status: TableStatus;
}
