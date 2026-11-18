import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../../ai/ai.service';
import type { AuthUser } from '../../../auth/auth-user';
import { OrdersQueryService } from '../../../orders/application/orders-query.service';
import { AddOrderItemUseCase } from '../../../orders/application/use-cases/add-order-item.use-case';
import { CreateOrderUseCase } from '../../../orders/application/use-cases/create-order.use-case';
import { RemoveOrderItemUseCase } from '../../../orders/application/use-cases/remove-order-item.use-case';
import { UpdateOrderItemUseCase } from '../../../orders/application/use-cases/update-order-item.use-case';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportsService } from '../../../reports/reports.service';
import type {
  PendingAction,
  ToolScope,
} from '../../application/ports/tool-client.port';
import { registerAnalyticsTools } from './analytics.tools';
import { MonitoringSnapshotProvider } from './monitoring.snapshot';
import { registerPosTools } from './pos.tools';

export interface McpServerOptions {
  scope: ToolScope;
  actor: AuthUser;
  areaId?: string;
  allowDestructive?: boolean;
  pending?: PendingAction[];
}

@Injectable()
export class McpServerFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly ai: AiService,
    private readonly snapshots: MonitoringSnapshotProvider,
    private readonly queries: OrdersQueryService,
    private readonly createOrder: CreateOrderUseCase,
    private readonly addItem: AddOrderItemUseCase,
    private readonly updateItem: UpdateOrderItemUseCase,
    private readonly removeItem: RemoveOrderItemUseCase,
    private readonly config: ConfigService,
  ) {}

  create(options: McpServerOptions): McpServer {
    const server = new McpServer({
      name: 'maminco-insights',
      version: '1.0.0',
    });

    if (options.scope === 'analytics') {
      registerAnalyticsTools(server, {
        reports: this.reports,
        ai: this.ai,
        snapshots: this.snapshots,
        timeZone:
          this.config.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz',
      });
    } else {
      registerPosTools(
        server,
        {
          prisma: this.prisma,
          queries: this.queries,
          createOrder: this.createOrder,
          addItem: this.addItem,
          updateItem: this.updateItem,
          removeItem: this.removeItem,
        },
        {
          actor: options.actor,
          areaId: options.areaId,
          allowDestructive: options.allowDestructive ?? false,
          pending: options.pending ?? [],
        },
      );
    }
    return server;
  }
}
