import * as crypto from 'crypto';
import { PlisioService } from './plisio.service';
import { PlisioCallbackPayload } from './plisio-callback.types';

describe('PlisioService', () => {
  const secret = 'test-secret';
  const originalSecret = process.env.PLISIO_SECRET_KEY;

  beforeEach(() => {
    process.env.PLISIO_SECRET_KEY = secret;
  });

  afterAll(() => {
    process.env.PLISIO_SECRET_KEY = originalSecret;
  });

  it('should verify Plisio JSON callback hashes', () => {
    const payloadWithoutHash = {
      status: 'completed',
      txn_id: 'txn_1',
      order_number: 'DEP_1',
      amount: '0.001',
      source_amount: '100',
      source_currency: 'RUB',
      currency: 'BTC',
    };
    const verify_hash = crypto
      .createHmac('sha1', secret)
      .update(JSON.stringify(payloadWithoutHash))
      .digest('hex');

    const service = new PlisioService();

    expect(
      service.verifyHash({
        ...payloadWithoutHash,
        verify_hash,
      } satisfies PlisioCallbackPayload),
    ).toBe(true);
  });

  it('should reject invalid callback hashes', () => {
    const service = new PlisioService();

    expect(
      service.verifyHash({
        status: 'completed',
        txn_id: 'txn_1',
        order_number: 'DEP_1',
        amount: '0.001',
        source_amount: '100',
        source_currency: 'RUB',
        currency: 'BTC',
        verify_hash: 'bad',
      }),
    ).toBe(false);
  });
});
