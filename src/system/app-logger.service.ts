import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { LogsService } from './logs.service';

/**
 * Nest logger that prints to the console (stdout, captured by Docker) and
 * forwards entries to `LogsService` for persistence + retention.
 */
@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor(private readonly logsService: LogsService) {
    super();
  }

  private record(level: LogLevel, message: unknown, context?: string) {
    const text =
      typeof message === 'string' ? message : this.safeStringify(message);
    this.logsService?.enqueue({
      timestamp: new Date().toISOString(),
      level,
      message: text,
      context: context ?? this.context,
    });
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
}
