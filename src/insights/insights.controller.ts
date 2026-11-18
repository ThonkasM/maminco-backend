import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { MonitoringAgent } from './application/agents/monitoring-agent';
import { ReportAgent } from './application/agents/report-agent';
import { VoiceAgent } from './application/agents/voice-agent';
import { AskDto, VoiceCommandDto, VoiceConfirmDto } from './dto/insights.dto';
import { LlmRegistry } from './infrastructure/llm/llm-registry';
import { LLM_PORT } from './application/ports/llm.port';

export const VOICE_FLAG = 'voice_interaction';

@ApiTags('insights')
@Controller('api/insights')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsightsController {
  constructor(
    private readonly reportAgent: ReportAgent,
    private readonly monitoringAgent: MonitoringAgent,
    private readonly voiceAgent: VoiceAgent,
    private readonly flags: FeatureFlagsService,
    @Inject(LLM_PORT) private readonly llm: LlmRegistry,
  ) {}

  @Get('engines')
  @Roles('MANAGER', 'ADMINISTRATOR', 'WAITER', 'CASHIER')
  async engines() {
    const engines = await this.llm.status();
    const active =
      engines.find((e) => e.available && !e.circuitOpen) ?? engines.at(-1);
    return { engines, active: active ?? null };
  }

  @Post('ask')
  @Roles('MANAGER', 'ADMINISTRATOR')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthUser) {
    return this.reportAgent.ask({ ...dto, actor: user });
  }

  @Get('alerts')
  @Roles('MANAGER', 'ADMINISTRATOR')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  alerts(
    @Query('refresh') refresh: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.monitoringAgent.check(
      user,
      refresh === '1' || refresh === 'true',
    );
  }

  @Post('voice')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async voice(@Body() dto: VoiceCommandDto, @CurrentUser() user: AuthUser) {
    await this.assertVoiceEnabled();
    return this.voiceAgent.run({ ...dto, actor: user });
  }

  @Post('voice/confirm')
  @Roles('WAITER', 'CASHIER', 'MANAGER', 'ADMINISTRATOR')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async confirm(@Body() dto: VoiceConfirmDto, @CurrentUser() user: AuthUser) {
    await this.assertVoiceEnabled();
    return this.voiceAgent.confirm(dto.token, user);
  }

  private async assertVoiceEnabled() {
    if (!(await this.flags.isEnabled(VOICE_FLAG))) {
      throw new ForbiddenException('La interacción por voz está desactivada.');
    }
  }
}
