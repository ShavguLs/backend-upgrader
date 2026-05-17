/* eslint-disable */
import { WaxpeerProvider } from './waxpeer.provider';

describe('WaxpeerProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('converts min to provider USD price (min / 1000)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        items: [
          {
            name: 'AK-47 | Redline (Field-Tested)',
            count: 484,
            min: 31386,
            img: 'https://images.waxpeer.com/i/redline.webp',
            type: 'Rifles',
            rarity_color: '#d32ce6',
          },
        ],
      }),
    }) as any;

    const provider = new WaxpeerProvider();
    const items = await provider.getCatalog();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      providerPriceUsd: '31.3860',
      imageUrl: 'https://images.waxpeer.com/i/redline.webp',
      category: 'Rifles',
      rarityColor: '#d32ce6',
      availableCount: 484,
      providerItemId: 'AK-47 | Redline (Field-Tested)',
    });
  });

  it('skips invalid or unavailable rows', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        items: [
          { name: 'Missing img', min: 100 },
          { name: 'Bad min', img: 'https://x/y.webp', min: 0 },
          { img: 'https://x/y.webp', min: 100 },
          { name: 'Zero count', img: 'https://x/y.webp', min: 100, count: 0 },
          {
            name: 'Valid (Factory New)',
            img: 'https://x/v.webp',
            min: 5000,
            count: 12,
          },
        ],
      }),
    }) as any;

    const provider = new WaxpeerProvider();
    const items = await provider.getCatalog();

    expect(items).toHaveLength(1);
    expect(items[0].marketHashName).toBe('Valid (Factory New)');
  });

  it('throws when response is malformed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as any;

    const provider = new WaxpeerProvider();
    await expect(provider.getCatalog()).rejects.toThrow(/malformed/);
  });

  it('throws when HTTP request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({}),
    }) as any;

    const provider = new WaxpeerProvider();
    await expect(provider.getCatalog()).rejects.toThrow(/Waxpeer prices/);
  });
});
