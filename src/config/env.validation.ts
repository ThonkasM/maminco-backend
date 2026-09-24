import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters long' })
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  INTERNAL_SERVICE_TOKEN?: string;

  @IsOptional()
  @IsString()
  AI_SERVICE_URL?: string;

  @IsOptional()
  @IsString()
  LOG_DB_ENABLED?: string;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsNumberString()
  LOG_FLUSH_INTERVAL_MS?: string;

  @IsOptional()
  @IsNumberString()
  LOG_RETENTION_DAYS?: string;

  @IsOptional()
  @IsNumberString()
  LOG_MAX_ROWS?: string;

  @IsOptional()
  @IsString()
  REPORT_TIMEZONE?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Config validation error: ${messages}`);
  }

  return validated;
}
