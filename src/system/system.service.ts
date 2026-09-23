import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PrintingService } from '../printing/printing.service';
import { AiService } from '../ai/ai.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { PaymentsGateway } from '../payments/payments.gateway';
import { AppLogger, LogEntry } from './app-logger.service';

export interface ServiceHealth {
    reachable: boolean;
    latencyMs?: number | null;
    detail?: Record<string, unknown>;
    url?: string;
}

@Injectable()
export class SystemService {
    private readonly logger = new Logger(SystemService.name);
    private readonly startedAt = new Date();

    constructor(
        private readonly prisma: PrismaService,
        private readonly printing: PrintingService,
        private readonly ai: AiService,
        private readonly ordersGateway: OrdersGateway,
        private readonly paymentsGateway: PaymentsGateway,
        private readonly appLogger: AppLogger,
        private readonly config: ConfigService,
    ) {}

    async getStatus() {
        const [database, ai, printing] = await Promise.all([
            this.checkDatabase(),
            this.checkAi(),
            this.checkPrinting(),
        ]);

        const memory = process.memoryUsage();

        return {
            server: {
                status: 'ok',
                startedAt: this.startedAt.toISOString(),
                uptimeSeconds: Math.round(process.uptime()),
                nodeVersion: process.version,
                environment: this.config.get<string>('NODE_ENV') ?? 'development',
                memory: {
                    rssMb: Math.round(memory.rss / 1024 / 1024),
                    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
                },
            },
            database,
            ai,
            printing,
            realtime: {
                clients:
                    this.ordersGateway.getConnectedClients() +
                    this.paymentsGateway.getConnectedClients(),
            },
            timestamp: new Date().toISOString(),
        };
    }

    private async checkDatabase(): Promise<ServiceHealth> {
        const start = Date.now();
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            return { reachable: true, latencyMs: Date.now() - start };
        } catch (error) {
            this.logger.warn(
                `Database health check failed: ${error instanceof Error ? error.message : error}`,
            );
            return { reachable: false, latencyMs: null };
        }
    }

    private async checkAi(): Promise<ServiceHealth> {
        const url = this.config.get<string>('AI_SERVICE_URL') ?? null;
        try {
            const detail = await this.ai.getHealth();
            return {
                reachable: true,
                url: url ?? undefined,
                detail:
                    typeof detail === 'object' && detail !== null
                        ? (detail as Record<string, unknown>)
                        : { response: detail },
            };
        } catch {
            return { reachable: false, url: url ?? undefined };
        }
    }

    private async checkPrinting(): Promise<ServiceHealth> {
        try {
            const [printers, defaultPrinter] = await Promise.all([
                this.printing.listPrinters(),
                this.printing.getDefaultPrinter(),
            ]);
            return {
                reachable: Boolean(defaultPrinter) || printers.length > 0,
                detail: { printers, defaultPrinter },
            };
        } catch (error) {
            this.logger.warn(
                `Printing health check failed: ${error instanceof Error ? error.message : error}`,
            );
            return { reachable: false, detail: { printers: [], defaultPrinter: null } };
        }
    }

    getLogs(limit: number, level?: LogEntry['level']): LogEntry[] {
        return this.appLogger.getRecent(limit, level);
    }

    getConfig() {
        const corsOrigin = this.config.get<string>('CORS_ORIGIN');
        return {
            environment: this.config.get<string>('NODE_ENV') ?? 'development',
            port: Number(this.config.get<string>('PORT') ?? 3000),
            apiBasePath: '/api',
            corsOrigins: corsOrigin
                ? corsOrigin.split(',').map((origin) => origin.trim())
                : ['http://localhost:3000', 'http://localhost:3001'],
            aiServiceUrl: this.config.get<string>('AI_SERVICE_URL') ?? null,
            aiEnabled: Boolean(this.config.get<string>('INTERNAL_SERVICE_TOKEN')),
            startedAt: this.startedAt.toISOString(),
        };
    }
}
