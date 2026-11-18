import { NotificationType, PushChannelKind, UserRole } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SendNotificationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  body: string;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles?: UserRole[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  userIds?: string[];
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class SubscribePushDto {
  @IsEnum(PushChannelKind)
  kind: PushChannelKind;

  @IsString()
  @MaxLength(1000)
  endpoint: string;

  @IsOptional()
  @IsString()
  p256dh?: string;

  @IsOptional()
  @IsString()
  auth?: string;
}

export class UnsubscribePushDto {
  @IsString()
  endpoint: string;
}

export class UpdateRuleDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @IsEnum(UserRole, { each: true })
  audienceRoles: UserRole[];
}

export type RuleTypeParam = NotificationType;
