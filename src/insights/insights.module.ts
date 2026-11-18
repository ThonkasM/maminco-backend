import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { OrdersModule } from '../orders/orders.module';
import { todayInZone } from '../reports/report-range';
import { ReportsModule } from '../reports/reports.module';
import { MonitoringAgent } from './application/agents/monitoring-agent';
import { ReportAgent } from './application/agents/report-agent';
import {
  PendingConfirmations,
  VoiceAgent,
} from './application/agents/voice-agent';
import { LLM_PORT, type LlmPort } from './application/ports/llm.port';
import {
  TOOL_CLIENT_FACTORY,
  type ToolClientFactory,
} from './application/ports/tool-client.port';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertNotifier } from './alert-notifier.service';
import { InsightsController } from './insights.controller';
import { buildLlmRegistry } from './infrastructure/llm/llm.providers';
import { InMemoryToolClientFactory } from './infrastructure/mcp/in-memory-tool-client.factory';
import { McpServerFactory } from './infrastructure/mcp/mcp-server.factory';
import { MonitoringSnapshotProvider } from './infrastructure/mcp/monitoring.snapshot';
import { McpController } from './mcp.controller';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    AiModule,
    ReportsModule,
    OrdersModule,
    FeatureFlagsModule,
    NotificationsModule,
  ],
  controllers: [InsightsController, McpController],
  providers: [
    AlertNotifier,
    MonitoringSnapshotProvider,
    McpServerFactory,
    { provide: TOOL_CLIENT_FACTORY, useClass: InMemoryToolClientFactory },
    {
      provide: LLM_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildLlmRegistry(config),
    },
    {
      provide: ReportAgent,
      inject: [LLM_PORT, TOOL_CLIENT_FACTORY, ConfigService],
      useFactory: (
        llm: LlmPort,
        tools: ToolClientFactory,
        config: ConfigService,
      ) =>
        new ReportAgent(llm, tools, () =>
          todayInZone(
            config.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz',
          ),
        ),
    },
    {
      provide: MonitoringAgent,
      inject: [LLM_PORT, TOOL_CLIENT_FACTORY],
      useFactory: (llm: LlmPort, tools: ToolClientFactory) =>
        new MonitoringAgent(llm, tools),
    },
    { provide: PendingConfirmations, useValue: new PendingConfirmations() },
    {
      provide: VoiceAgent,
      inject: [LLM_PORT, TOOL_CLIENT_FACTORY, PendingConfirmations],
      useFactory: (
        llm: LlmPort,
        tools: ToolClientFactory,
        pending: PendingConfirmations,
      ) => new VoiceAgent(llm, tools, pending),
    },
  ],
})
export class InsightsModule {}
