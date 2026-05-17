export interface ProviderSkin {
  marketHashName: string;
  providerPriceUsd: string;
  imageUrl: string;
  category?: string;
  rarityColor?: string;
  availableCount?: number;
  providerItemId?: string;
  rawData: unknown;
}

export interface SkinProvider {
  getName(): string;
  getCatalog(): Promise<ProviderSkin[]>;
}
