/* eslint-disable */
import { FxRateService } from './fx-rate.service';

describe('FxRateService', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('returns live RUB rate when API succeeds', async () => {
    process.env.USD_RUB_RATE = '50';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', rates: { RUB: 92.5 } }),
    }) as any;

    const service = new FxRateService();
    const rate = await service.getUsdToRubRate();
    expect(rate).toBe(92.5);
  });

  it('caches the live rate across calls within TTL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', rates: { RUB: 92.5 } }),
    });
    global.fetch = fetchMock as any;

    const service = new FxRateService();
    await service.getUsdToRubRate();
    await service.getUsdToRubRate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to USD_RUB_RATE when API fails', async () => {
    process.env.USD_RUB_RATE = '88';
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as any;

    const service = new FxRateService();
    const rate = await service.getUsdToRubRate();
    expect(rate).toBe(88);
  });

  it('falls back when API returns a non-OK status', async () => {
    process.env.USD_RUB_RATE = '77';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    }) as any;

    const service = new FxRateService();
    const rate = await service.getUsdToRubRate();
    expect(rate).toBe(77);
  });

  it('throws when both live API and fallback are unavailable', async () => {
    delete process.env.USD_RUB_RATE;
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as any;

    const service = new FxRateService();
    await expect(service.getUsdToRubRate()).rejects.toThrow(
      /FX rate unavailable/,
    );
  });

  it('rejects invalid fallback rate', async () => {
    process.env.USD_RUB_RATE = '-5';
    global.fetch = jest.fn().mockRejectedValue(new Error('boom')) as any;

    const service = new FxRateService();
    await expect(service.getUsdToRubRate()).rejects.toThrow(
      /FX rate unavailable/,
    );
  });
});
