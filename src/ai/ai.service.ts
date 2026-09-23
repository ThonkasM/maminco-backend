import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('AI_SERVICE_URL') || 'http://localhost:8000';
  }

  private get internalToken(): string {
    return this.config.get<string>('INTERNAL_SERVICE_TOKEN') || '';
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 'X-Internal-Token': this.internalToken },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({
          message: 'AI service error',
        }));
        throw new HttpException(body, response.status);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn(
        `AI service unreachable: ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException('AI service unavailable');
    }
  }

  getSalesForecast(horizon: number) {
    return this.request('GET', '/forecast/sales', { horizon });
  }

  getProductForecast(horizon: number, limit: number) {
    return this.request('GET', '/forecast/products', { horizon, limit });
  }

  getPeakHours() {
    return this.request('GET', '/forecast/peak-hours');
  }

  getAnomalies() {
    return this.request('GET', '/insights/anomalies');
  }

  getMetricsSummary() {
    return this.request('GET', '/metrics/summary');
  }

  getHealth() {
    return this.request('GET', '/health');
  }

  retrain() {
    return this.request('POST', '/train');
  }
}
