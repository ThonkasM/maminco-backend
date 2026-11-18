import { Injectable } from '@nestjs/common';
import { ReportsService } from '../../reports/reports.service';
import type { BusinessCalendar } from '../application/ports/business-calendar';

@Injectable()
export class ReportsBusinessCalendar implements BusinessCalendar {
  constructor(private readonly reports: ReportsService) {}

  today(): Promise<string> {
    return this.reports.businessToday();
  }

  async bounds(from: string, to: string): Promise<{ start: Date; end: Date }> {
    const [first, last] = await Promise.all([
      this.reports.businessDayBounds(from),
      this.reports.businessDayBounds(to),
    ]);
    return { start: first.start, end: last.end };
  }
}
