/* eslint-disable */
import { WaxpeerWithdrawalProvider } from './waxpeer-withdrawal.provider';

describe('WaxpeerWithdrawalProvider', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.WAXPEER_API_KEY;

  beforeEach(() => {
    process.env.WAXPEER_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.WAXPEER_API_KEY;
    } else {
      process.env.WAXPEER_API_KEY = originalApiKey;
    }
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('returns false when api key missing', () => {
      delete process.env.WAXPEER_API_KEY;
      const provider = new WaxpeerWithdrawalProvider();
      expect(provider.isConfigured()).toBe(false);
    });

    it('returns true when api key set', () => {
      const provider = new WaxpeerWithdrawalProvider();
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('checkTradeLink', () => {
    it('posts trade URL and parses response', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          partner: '900',
          token: 'ABcd',
        }),
      });
      global.fetch = fetchMock as any;

      const provider = new WaxpeerWithdrawalProvider();
      const result = await provider.checkTradeLink(
        'https://steamcommunity.com/tradeoffer/new/?partner=900&token=ABcd',
      );

      expect(result.success).toBe(true);
      expect(result.partner).toBe('900');
      expect(result.token).toBe('ABcd');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/check-tradelink?api=test-key'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('findCheapestListing', () => {
    it('returns cheapest exact-name listing', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          items: [
            { name: 'AK-47 | Redline (FT)', price: 12000, item_id: 'a' },
            { name: 'AK-47 | Redline (FT)', price: 9500, item_id: 'b' },
            { name: 'Other', price: 5000, item_id: 'c' },
          ],
        }),
      });
      global.fetch = fetchMock as any;

      const provider = new WaxpeerWithdrawalProvider();
      const listing = await provider.findCheapestListing('AK-47 | Redline (FT)');
      expect(listing).not.toBeNull();
      expect(listing?.itemId).toBe('b');
      expect(listing?.priceThousandths).toBe(9500);
    });

    it('accepts object-map item responses from Waxpeer', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          items: {
            listingA: { name: 'AK-47 | Redline (FT)', price: 12000, item_id: 'a' },
            listingB: { name: 'AK-47 | Redline (FT)', price: 9500, item_id: 'b' },
          },
        }),
      }) as any;

      const provider = new WaxpeerWithdrawalProvider();
      const listing = await provider.findCheapestListing('AK-47 | Redline (FT)');

      expect(listing).not.toBeNull();
      expect(listing?.itemId).toBe('b');
      expect(listing?.priceThousandths).toBe(9500);
    });

    it('returns null when no exact match', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, items: [] }),
      }) as any;

      const provider = new WaxpeerWithdrawalProvider();
      expect(await provider.findCheapestListing('Anything')).toBeNull();
    });
  });

  describe('buyOneP2p', () => {
    it('passes all required query params', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, id: 'trade-1', price: 9500 }),
      });
      global.fetch = fetchMock as any;

      const provider = new WaxpeerWithdrawalProvider();
      const result = await provider.buyOneP2p({
        projectId: 'withdrawal_42',
        itemId: 'listing-1',
        priceThousandths: 9500,
        partner: '900',
        token: 'ABcd',
      });

      expect(result.success).toBe(true);
      const url: string = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('/v1/buy-one-p2p');
      expect(url).toContain('api=test-key');
      expect(url).toContain('project_id=withdrawal_42');
      expect(url).toContain('item_id=listing-1');
      expect(url).toContain('price=9500');
      expect(url).toContain('partner=900');
      expect(url).toContain('token=ABcd');
    });

    it('flags duplicate project id error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          msg: 'Buy request with projectId already exists',
        }),
      }) as any;

      const provider = new WaxpeerWithdrawalProvider();
      const result = await provider.buyOneP2p({
        projectId: 'withdrawal_42',
        itemId: 'a',
        priceThousandths: 100,
        partner: '1',
        token: 'x',
      });
      expect(result.success).toBe(false);
      expect(result.duplicateProjectId).toBe(true);
    });
  });

  describe('checkProjectIds', () => {
    it('parses trades into status entries', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          trades: [
            { project_id: 'withdrawal_1', status: 5, trade_id: 't1' },
            { project_id: 'withdrawal_2', status: 4 },
          ],
        }),
      }) as any;

      const provider = new WaxpeerWithdrawalProvider();
      const result = await provider.checkProjectIds([
        'withdrawal_1',
        'withdrawal_2',
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({ projectId: 'withdrawal_1', status: 5, tradeId: 't1' }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({ projectId: 'withdrawal_2', status: 4 }),
      );
    });

    it('returns [] when ids empty', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as any;
      const provider = new WaxpeerWithdrawalProvider();
      expect(await provider.checkProjectIds([])).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
