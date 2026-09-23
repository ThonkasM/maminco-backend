import {
  Injectable,
  Logger,
  LogLevel,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
}

export interface LogQuery {
  limit?: number;
  level?: LogLevel;
  since?: Date;
  search?: string;
}

const LEVEL_WEIGHT: Record<string, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/**
 * Persists logs to PostgreSQL with an in-memory cache and a bounded flush
 * buffer (never blocks the request/simulation path). A daily cron applies the
 * retention policy: delete entries older than `LOG_RETENTION_DAYS` and cap the
 * table at `LOG_MAX_ROWS` rows.
 */
@Injectable()
export class LogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  private readonly buffer: Prisma.SystemLogCreateManyInput[] = [];
  private readonly recent: LogEntry[] = [];
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get dbEnabled(): boolean {
    return this.config.get<string>('LOG_DB_ENABLED') !== 'false';
  }

  private get flushIntervalMs(): number {
    return Number(this.config.get<string>('LOG_FLUSH_INTERVAL_MS') ?? 2000);
  }

  private get minLevel(): number {
    const configured = this.config.get<string>('LOG_LEVEL') ?? 'log';
    return LEVEL_WEIGHT[configured] ?? LEVEL_WEIGHT.log;
  }

  get retentionDays(): number {
    return Number(this.config.get<string>('LOG_RETENTION_DAYS') ?? 3);
  }

  get maxRows(): number {
    return Number(this.config.get<string>('LOG_MAX_ROWS') ?? 20000);
  }

  onModuleInit() {
    if (!this.dbEnabled) return;
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    void this.prune();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  /** Cache + persist (non-blocking). */
  enqueue(entry: LogEntry) {
    this.recent.push(entry);
    if (this.recent.length > 300) this.recent.shift();

    if (!this.dbEnabled) return;
    if ((LEVEL_WEIGHT[entry.level] ?? 0) < this.minLevel) return;

    this.buffer.push({
      timestamp: new Date(entry.timestamp),
      level: entry.level,
      context: entry.context ?? null,
      message: entry.message,
    });
    if (this.buffer.length >= 500) void this.flush();
  }

  /** Flush buffered logs to the database in a single batch. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.prisma.systemLog.createMany({ data: batch });
    } catch (error) {
      // Never route this through the app logger: it would feed itself.
      process.stderr.write(
        `[logs] failed to persist ${batch.length} entries: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
  }

  async query(query: LogQuery): Promise<{ data: LogEntry[]; total: number }> {
    const limit = Math.min(500, Math.max(1, query.limit ?? 100));

    if (!this.dbEnabled) {
      const data = query.level
        ? this.recent.filter((entry) => entry.level === query.level)
        : this.recent;
      return { data: data.slice(-limit).reverse(), total: data.length };
    }

    const where: Prisma.SystemLogWhereInput = {};
    if (query.level) where.level = query.level;
    if (query.since) where.timestamp = { gte: query.since };
    if (query.search) {
      where.message = { contains: query.search, mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.systemLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        timestamp: row.timestamp.toISOString(),
        level: row.level as LogLevel,
        message: row.message,
        context: row.context ?? undefined,
      })),
      total,
    };
  }

  async stats() {
    if (!this.dbEnabled) {
      return {
        count: this.recent.length,
        oldest: this.recent[0]?.timestamp ?? null,
        newest: this.recent.at(-1)?.timestamp ?? null,
        retentionDays: this.retentionDays,
        maxRows: this.maxRows,
      };
    }

    const [count, oldest, newest] = await Promise.all([
      this.prisma.systemLog.count(),
      this.prisma.systemLog.findFirst({
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      }),
      this.prisma.systemLog.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
    ]);

    return {
      count,
      oldest: oldest?.timestamp.toISOString() ?? null,
      newest: newest?.timestamp.toISOString() ?? null,
      retentionDays: this.retentionDays,
      maxRows: this.maxRows,
    };
  }

  /** Retention policy: applied daily and on startup. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune(): Promise<{ deletedByAge: number; deletedByCap: number }> {
    if (!this.dbEnabled) return { deletedByAge: 0, deletedByCap: 0 };

    const cutoff = new Date(Date.now() - this.retentionDays * 86_400_000);

    try {
      await this.flush();

      const { count: deletedByAge } = await this.prisma.systemLog.deleteMany({
        where: { timestamp: { lt: cutoff } },
      });

      let deletedByCap = 0;
      const count = await this.prisma.systemLog.count();
      if (count > this.maxRows) {
        const oldest = await this.prisma.systemLog.findMany({
          orderBy: { timestamp: 'asc' },
          take: count - this.maxRows,
          select: { id: true },
        });
        const result = await this.prisma.systemLog.deleteMany({
          where: { id: { in: oldest.map((row) => row.id) } },
        });
        deletedByCap = result.count;
      }

      if (deletedByAge || deletedByCap) {
        this.logger.log(
          `Log retention applied: ${deletedByAge} by age, ${deletedByCap} by cap`,
        );
      }
      return { deletedByAge, deletedByCap };
    } catch (error) {
      this.logger.warn(
        `Log retention failed: ${error instanceof Error ? error.message : error}`,
      );
      return { deletedByAge: 0, deletedByCap: 0 };
    }
  }
}
