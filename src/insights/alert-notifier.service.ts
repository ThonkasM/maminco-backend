import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { todayInZone } from '../reports/report-range';
import { evaluateAlerts } from './domain/alert-rules';
import { MonitoringSnapshotProvider } from './infrastructure/mcp/monitoring.snapshot';

const CHECK_EVERY_MS = 5 * 60_000;

/** Turns critical monitoring alerts into push notifications, once per alert per day. */
@Injectable()
export class AlertNotifier {
  private readonly logger = new Logger(AlertNotifier.name);
  private readonly sent = new Set<string>();

  constructor(
    private readonly snapshots: MonitoringSnapshotProvider,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Interval(CHECK_EVERY_MS)
  async check() {
    try {
      const today = todayInZone(
        this.config.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz',
      );
      for (const key of this.sent)
        if (!key.endsWith(today)) this.sent.delete(key);

      const alerts = evaluateAlerts(await this.snapshots.collect()).filter(
        (alert) => alert.severity === 'critical',
      );
      for (const alert of alerts) {
        const key = `${alert.id}:${today}`;
        if (this.sent.has(key)) continue;
        this.sent.add(key);
        await this.notifications.publishAutomatic(
          'SYSTEM_ALERT',
          { title: alert.title, body: alert.detail, url: '/insights' },
          { alertId: alert.id },
        );
      }
    } catch (error) {
      this.logger.warn(`Alert check failed: ${String(error)}`);
    }
  }
}
