import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: string;
}

const MAX_ENTRIES = 500;

/**
 * Nest logger that also keeps a bounded in-memory ring buffer so the admin UI
 * can display recent server logs without touching the filesystem.
 */
@Injectable()
export class AppLogger extends ConsoleLogger {
    private readonly entries: LogEntry[] = [];

    private record(level: LogLevel, message: unknown, context?: string) {
        const text =
            typeof message === 'string' ? message : this.safeStringify(message);
        this.entries.push({
            timestamp: new Date().toISOString(),
            level,
            message: text,
            context: context ?? this.context,
        });
        if (this.entries.length > MAX_ENTRIES) {
            this.entries.splice(0, this.entries.length - MAX_ENTRIES);
        }
    }

    private safeStringify(value: unknown): string {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    override log(message: unknown, context?: string) {
        this.record('log', message, context);
        super.log(message, context);
    }

    override error(message: unknown, stack?: string, context?: string) {
        this.record('error', message, context ?? stack);
        super.error(message, stack, context);
    }

    override warn(message: unknown, context?: string) {
        this.record('warn', message, context);
        super.warn(message, context);
    }

    override debug(message: unknown, context?: string) {
        this.record('debug', message, context);
        super.debug(message, context);
    }

    override verbose(message: unknown, context?: string) {
        this.record('verbose', message, context);
        super.verbose(message, context);
    }

    override fatal(message: unknown, context?: string) {
        this.record('fatal', message, context);
        super.fatal(message, context);
    }

    getRecent(limit = 100, level?: LogLevel): LogEntry[] {
        const filtered = level
            ? this.entries.filter((entry) => entry.level === level)
            : this.entries;
        return filtered.slice(-limit).reverse();
    }
}
