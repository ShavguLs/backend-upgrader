import { Injectable, Logger } from '@nestjs/common';

export interface WaxpeerCheckTradeUrlResult {
  success: boolean;
  partner?: string;
  token?: string;
  message?: string;
}

export interface WaxpeerListing {
  itemId: string;
  name: string;
  priceThousandths: number;
  raw: unknown;
}

export interface WaxpeerBuyResult {
  success: boolean;
  id?: string;
  price?: number;
  message?: string;
  duplicateProjectId: boolean;
  raw: unknown;
}

export interface WaxpeerProjectStatus {
  projectId: string;
  status: number | null;
  tradeId?: string;
  raw: unknown;
}

interface CheckTradeLinkResponse {
  success?: boolean;
  partner?: unknown;
  token?: unknown;
  msg?: unknown;
}

interface SearchItemsResponse {
  success?: boolean;
  items?: unknown;
}

interface SearchItem {
  name?: unknown;
  price?: unknown;
  item_id?: unknown;
}

interface BuyOneP2pResponse {
  success?: boolean;
  id?: unknown;
  price?: unknown;
  msg?: unknown;
}

interface CheckProjectIdResponse {
  success?: boolean;
  trades?: unknown;
  msg?: unknown;
}

interface ProjectTrade {
  project_id?: unknown;
  status?: unknown;
  trade_id?: unknown;
}

@Injectable()
export class WaxpeerWithdrawalProvider {
  private readonly logger = new Logger(WaxpeerWithdrawalProvider.name);

  private normalizeSearchItems(items: unknown): SearchItem[] | null {
    if (Array.isArray(items)) {
      return items as SearchItem[];
    }

    if (items !== null && typeof items === 'object') {
      return Object.values(items as Record<string, unknown>).flatMap((item) => {
        const candidates = Array.isArray(item) ? item : [item];
        return candidates.filter(
          (candidate): candidate is SearchItem =>
            candidate !== null && typeof candidate === 'object',
        );
      });
    }

    return null;
  }

  private get baseUrl(): string {
    return (process.env.WAXPEER_API_BASE_URL || 'https://api.waxpeer.com').replace(
      /\/$/,
      '',
    );
  }

  private get apiKey(): string | undefined {
    return process.env.WAXPEER_API_KEY;
  }

  private get game(): string {
    return process.env.WAXPEER_WITHDRAW_GAME || 'csgo';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private requireApiKey(): string {
    const key = this.apiKey;
    if (!key) {
      throw new Error('WAXPEER_API_KEY is not configured');
    }
    return key;
  }

  async checkTradeLink(tradeUrl: string): Promise<WaxpeerCheckTradeUrlResult> {
    const api = this.requireApiKey();
    const url = `${this.baseUrl}/v1/check-tradelink?api=${encodeURIComponent(api)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradelink: tradeUrl }),
    });

    if (!response.ok) {
      throw new Error(
        `Waxpeer check-tradelink failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as CheckTradeLinkResponse;
    const partner = typeof data.partner === 'string' ? data.partner : undefined;
    const token = typeof data.token === 'string' ? data.token : undefined;
    const message = typeof data.msg === 'string' ? data.msg : undefined;

    return {
      success: data.success === true,
      partner,
      token,
      message,
    };
  }

  async findCheapestListing(
    marketHashName: string,
  ): Promise<WaxpeerListing | null> {
    const api = this.requireApiKey();
    const params = new URLSearchParams({
      api,
      game: this.game,
      name: marketHashName,
    });

    const url = `${this.baseUrl}/v2/search-items-by-name?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(
        `Waxpeer search-items-by-name failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as SearchItemsResponse;
    const items = this.normalizeSearchItems(data?.items);
    if (!data || data.success !== true || !items) {
      const itemsType =
        data === null || data === undefined
          ? 'undefined'
          : Array.isArray((data as SearchItemsResponse).items)
            ? 'array'
            : typeof (data as SearchItemsResponse).items;
      this.logger.warn(
        `Waxpeer listing search returned unusable response: ` +
          `skin="${marketHashName}" success=${data?.success ?? 'undefined'} ` +
          `itemsType=${itemsType}`,
      );
      return null;
    }

    const totalItemsReturned = items.length;
    let exactMatchCount = 0;
    let validExactMatchCount = 0;
    let cheapest: WaxpeerListing | null = null;
    const candidateNames: string[] = [];

    for (const raw of items) {
      const name = typeof raw?.name === 'string' ? raw.name : null;
      if (name === null) {
        continue;
      }
      if (name !== marketHashName) {
        if (candidateNames.length < 5) {
          candidateNames.push(name);
        }
        continue;
      }
      exactMatchCount += 1;

      if (typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price <= 0) {
        continue;
      }
      const itemId =
        typeof raw.item_id === 'string'
          ? raw.item_id
          : typeof raw.item_id === 'number'
            ? String(raw.item_id)
            : null;
      if (!itemId) {
        continue;
      }

      validExactMatchCount += 1;

      const listing: WaxpeerListing = {
        itemId,
        name,
        priceThousandths: Math.round(raw.price),
        raw,
      };

      if (!cheapest || listing.priceThousandths < cheapest.priceThousandths) {
        cheapest = listing;
      }
    }

    this.logger.log(
      `Waxpeer listing search summary: skin="${marketHashName}" ` +
        `total=${totalItemsReturned} exact=${exactMatchCount} ` +
        `validExact=${validExactMatchCount} ` +
        `cheapestId=${cheapest?.itemId ?? 'null'} ` +
        `cheapestPrice=${cheapest?.priceThousandths ?? 'null'}`,
    );

    if (exactMatchCount === 0) {
      const candidatesDisplay =
        candidateNames.length > 0
          ? ` candidates=${candidateNames.map((n) => `"${n}"`).join(',')}`
          : '';
      this.logger.warn(
        `Waxpeer listing search found no exact matches: ` +
          `skin="${marketHashName}" total=${totalItemsReturned}${candidatesDisplay}`,
      );
    }

    return cheapest;
  }

  async buyOneP2p(params: {
    projectId: string;
    itemId: string;
    priceThousandths: number;
    partner: string;
    token: string;
  }): Promise<WaxpeerBuyResult> {
    const api = this.requireApiKey();
    const query = new URLSearchParams({
      api,
      project_id: params.projectId,
      item_id: params.itemId,
      token: params.token,
      partner: params.partner,
      price: String(params.priceThousandths),
    });

    const url = `${this.baseUrl}/v1/buy-one-p2p?${query.toString()}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(
        `Waxpeer buy-one-p2p failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as BuyOneP2pResponse;
    const message = typeof data.msg === 'string' ? data.msg : undefined;
    const id =
      typeof data.id === 'string'
        ? data.id
        : typeof data.id === 'number'
          ? String(data.id)
          : undefined;
    const price =
      typeof data.price === 'number' && Number.isFinite(data.price)
        ? data.price
        : undefined;

    const duplicateProjectId =
      typeof message === 'string' && /projectId already exists/i.test(message);

    return {
      success: data.success === true,
      id,
      price,
      message,
      duplicateProjectId,
      raw: data,
    };
  }

  async checkProjectIds(projectIds: string[]): Promise<WaxpeerProjectStatus[]> {
    if (projectIds.length === 0) {
      return [];
    }
    const api = this.requireApiKey();
    const query = new URLSearchParams({ api });
    for (const id of projectIds) {
      query.append('id', id);
    }

    const url = `${this.baseUrl}/v1/check-many-project-id?${query.toString()}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(
        `Waxpeer check-many-project-id failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as CheckProjectIdResponse;
    if (!Array.isArray(data.trades)) {
      return [];
    }

    const result: WaxpeerProjectStatus[] = [];
    for (const trade of data.trades as ProjectTrade[]) {
      const projectId =
        typeof trade?.project_id === 'string'
          ? trade.project_id
          : typeof trade?.project_id === 'number'
            ? String(trade.project_id)
            : null;
      if (!projectId) {
        continue;
      }
      const status =
        typeof trade.status === 'number' && Number.isFinite(trade.status)
          ? trade.status
          : null;
      const tradeId =
        typeof trade.trade_id === 'string'
          ? trade.trade_id
          : typeof trade.trade_id === 'number'
            ? String(trade.trade_id)
            : undefined;
      result.push({ projectId, status, tradeId, raw: trade });
    }
    return result;
  }
}
