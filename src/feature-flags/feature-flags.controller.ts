import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { FeatureFlagsService } from './feature-flags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

class UpdateFeatureFlagDto {
  @IsBoolean()
  enabled: boolean;
}

const ALL_ROLES = ['ADMINISTRATOR', 'MANAGER', 'CASHIER', 'WAITER'] as const;

@Controller('api/features')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /** Full flag list (admin UI). */
  @Get()
  @Roles(...ALL_ROLES)
  list() {
    return this.featureFlagsService.findAll();
  }

  /** `key -> enabled` map for clients (web/mobile) to evaluate a flag. */
  @Get('evaluate')
  @Roles(...ALL_ROLES)
  evaluate() {
    return this.featureFlagsService.evaluate();
  }

  /** Enable/disable a flag (admin only). */
  @Patch(':key')
  @Roles('ADMINISTRATOR')
  update(@Param('key') key: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.featureFlagsService.update(key, dto.enabled);
  }
}
