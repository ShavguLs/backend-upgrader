import { Injectable, Logger } from '@nestjs/common';
import { ProviderSkin, SkinProvider } from './skin-provider.interface';

interface WaxpeerPricesResponse {
  success?: boolean;
  items?: unknown;
}

interface WaxpeerItem {
  name?: unknown;
  img?: unknown;
  min?: unknown;
  count?: unknown;
  type?: unknown;
  rarity_color?: unknown;
  steam_price?: unknown;
}

@Injectable()
export class WaxpeerProvider implements SkinProvider {
  private readonly logger = new Logger(WaxpeerProvider.name);
  private readonly baseUrl =
    process.env.WAXPEER_API_BASE_URL || 'https://api.waxpeer.com';
  private readonly pricesPath = process.env.WAXPEER_PRICES_PATH || '/v1/prices';

  getName(): string {
    return 'waxpeer';
  }

  async getCatalog(): Promise<ProviderSkin[]> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${this.pricesPath}`;

    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(
        `Waxpeer prices request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as WaxpeerPricesResponse;
    if (!data || data.success !== true || !Array.isArray(data.items)) {
      throw new Error('Waxpeer prices response is malformed');
    }

    const normalized: ProviderSkin[] = [];
    let skipped = 0;

    for (const raw of data.items as WaxpeerItem[]) {
      const item = this.normalize(raw);
      if (!item) {
        skipped++;
        continue;
      }
      normalized.push(item);
    }

    if (skipped > 0) {
      this.logger.warn(
        `Waxpeer provider skipped ${skipped} invalid rows out of ${(data.items as unknown[]).length}`,
      );
    }

    return normalized;
  }

  private normalize(raw: WaxpeerItem): ProviderSkin | null {
    if (typeof raw?.name !== 'string' || raw.name.length === 0) {
      return null;
    }
    if (typeof raw.img !== 'string' || raw.img.length === 0) {
      return null;
    }
    if (
      typeof raw.min !== 'number' ||
      !Number.isFinite(raw.min) ||
      raw.min <= 0
    ) {
      return null;
    }
    if (
      raw.count !== undefined &&
      (typeof raw.count !== 'number' || raw.count <= 0)
    ) {
      return null;
    }

    const providerPriceUsd = (raw.min / 1000).toFixed(4);

    return {
      marketHashName: raw.name,
      providerPriceUsd,
      imageUrl: raw.img,
      category: typeof raw.type === 'string' ? raw.type : undefined,
      rarityColor:
        typeof raw.rarity_color === 'string' ? raw.rarity_color : undefined,
      availableCount: typeof raw.count === 'number' ? raw.count : undefined,
      providerItemId: raw.name,
      rawData: raw,
    };
  }
}
