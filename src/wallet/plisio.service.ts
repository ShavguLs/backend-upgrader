import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PlisioCallbackPayload } from './plisio-callback.types';

@Injectable()
export class PlisioService {
  private readonly logger = new Logger(PlisioService.name);
  private readonly apiKey = process.env.PLISIO_SECRET_KEY || '';
  private readonly backendUrl =
    process.env.PUBLIC_BACKEND_URL || 'http://localhost:3000';

  constructor() {
    if (!this.apiKey) {
      this.logger.warn(
        'PLISIO_SECRET_KEY is not set. Plisio deposits will fail.',
      );
    }
  }

  async createInvoice(params: {
    amountRub: number;
    orderNumber: string;
    currency?: string;
  }): Promise<{ txn_id: string; invoice_url: string }> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'Payment gateway is not configured',
      );
    }

    const queryParams = new URLSearchParams({
      source_currency: 'RUB',
      source_amount: params.amountRub.toString(),
      order_number: params.orderNumber,
      order_name: `Deposit ${params.orderNumber}`,
      callback_url: `${this.backendUrl}/wallet/plisio/callback?json=true`,
      api_key: this.apiKey,
    });

    if (params.currency) {
      queryParams.append('currency', params.currency);
    }

    const url = `https://api.plisio.net/api/v1/invoices/new?${queryParams.toString()}`;

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        const text = await response.text();
        this.logger.error(`Plisio API error: ${response.status} - ${text}`);
        throw new InternalServerErrorException(
          'Failed to create deposit invoice',
        );
      }

      const data = (await response.json()) as {
        status: string;
        data?: { txn_id: string; invoice_url: string };
      };
      if (data.status !== 'success' || !data.data) {
        this.logger.error(
          `Plisio API returned failure: ${JSON.stringify(data)}`,
        );
        throw new InternalServerErrorException(
          'Failed to create deposit invoice',
        );
      }

      return {
        txn_id: data.data.txn_id,
        invoice_url: data.data.invoice_url,
      };
    } catch (error) {
      this.logger.error('Error contacting Plisio', error);
      throw new InternalServerErrorException(
        'Failed to communicate with payment gateway',
      );
    }
  }

  verifyHash(payload: PlisioCallbackPayload): boolean {
    if (!this.apiKey) {
      this.logger.error(
        'Cannot verify Plisio hash: PLISIO_SECRET_KEY is missing',
      );
      return false;
    }

    const { verify_hash, ...data } = payload;
    if (!verify_hash) {
      return false;
    }

    try {
      const jsonHash = this.hmacSha1(JSON.stringify(data));
      if (this.hashesMatch(jsonHash, verify_hash)) {
        return true;
      }

      const phpHash = this.hmacSha1(this.phpSerialize(this.sortObject(data)));
      if (this.hashesMatch(phpHash, verify_hash)) {
        return true;
      }
    } catch (e) {
      this.logger.error('Error computing hash', e);
    }

    this.logger.warn(
      'Plisio hash verification failed. Enable debug logging for details.',
    );
    return false;
  }

  private hmacSha1(value: string): string {
    return crypto.createHmac('sha1', this.apiKey).update(value).digest('hex');
  }

  private hashesMatch(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  private sortObject(value: Record<string, unknown>): Record<string, unknown> {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] =
          key === 'tx_urls' ? this.htmlEntityDecode(value[key]) : value[key];
        return sorted;
      }, {});
  }

  private htmlEntityDecode(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    return value
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private phpSerialize(value: unknown): string {
    if (value === null || value === undefined) {
      return 'N;';
    }

    if (typeof value === 'boolean') {
      return `b:${value ? 1 : 0};`;
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? `i:${value};` : `d:${value};`;
    }

    if (typeof value === 'string') {
      return `s:${Buffer.byteLength(value, 'utf8')}:"${value}";`;
    }

    if (Array.isArray(value)) {
      const entries = value
        .map(
          (item, index) =>
            `${this.phpSerialize(index)}${this.phpSerialize(item)}`,
        )
        .join('');
      return `a:${value.length}:{${entries}}`;
    }

    if (typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;
      const keys = Object.keys(objectValue);
      const entries = keys
        .map(
          (key) =>
            `${this.phpSerialize(key)}${this.phpSerialize(objectValue[key])}`,
        )
        .join('');
      return `a:${keys.length}:{${entries}}`;
    }

    return this.phpSerialize(String(value));
  }
}
