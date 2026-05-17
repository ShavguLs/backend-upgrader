import { Injectable, Logger } from '@nestjs/common';

interface FxRateApiResponse {
  result?: string;
  rates?: Record<string, unknown>;
}

@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);
  private readonly apiUrl =
    process.env.FX_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
  private readonly cacheTtlMs =
    (Number(process.env.FX_RATE_CACHE_SECONDS) || 3600) * 1000;

  private cachedRate: number | null = null;
  private cachedAt = 0;

  async getUsdToRubRate(): Promise<number> {
    const now = Date.now();
    if (
      this.cachedRate !== null &&
      now - this.cachedAt < this.cacheTtlMs &&
      this.isValidRate(this.cachedRate)
    ) {
      return this.cachedRate;
    }

    try {
      const liveRate = await this.fetchLiveRate();
      if (this.isValidRate(liveRate)) {
        this.cachedRate = liveRate;
        this.cachedAt = now;
        return liveRate;
      }
      this.logger.warn(
        `FX live rate invalid (${liveRate}), falling back to USD_RUB_RATE`,
      );
    } catch (error) {
      this.logger.warn(
        `FX live rate fetch failed: ${(error as Error).message}. Falling back to USD_RUB_RATE.`,
      );
    }

    const fallback = this.readFallbackRate();
    if (this.isValidRate(fallback)) {
      this.cachedRate = fallback;
      this.cachedAt = now;
      return fallback;
    }

    throw new Error(
      'FX rate unavailable: live API failed and USD_RUB_RATE fallback is missing or invalid',
    );
  }

  private async fetchLiveRate(): Promise<number> {
    const response = await fetch(this.apiUrl, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`FX API HTTP ${response.status}`);
    }

    const data = (await response.json()) as FxRateApiResponse;
    if (!data?.rates) {
      throw new Error('FX API response missing rates');
    }

    const rub = data.rates.RUB;
    if (typeof rub !== 'number' || !Number.isFinite(rub)) {
      throw new Error('FX API response missing RUB rate');
    }

    return rub;
  }

  private readFallbackRate(): number {
    const raw = process.env.USD_RUB_RATE;
    if (!raw) {
      return NaN;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  private isValidRate(rate: number): boolean {
    return Number.isFinite(rate) && rate > 0;
  }
}
