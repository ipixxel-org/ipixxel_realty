import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Razorpay from 'razorpay';
import type { RazorpayConfig } from './razorpay.config';
import { RazorpaySettingsService } from './razorpay-settings.service';

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
}

export interface GatewayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  error_description?: string | null;
}

/** Where the gateway gets its credentials (RazorpaySettingsService). */
export interface RazorpayConfigSource {
  current(): Promise<RazorpayConfig | null>;
}

/**
 * Thin wrapper over the Razorpay SDK so PaymentsService can be unit-tested
 * with a fake. Every call goes through config(), which reads the current
 * credentials (console first, env fallback) and turns "no keys" into a 503
 * instead of a crash.
 */
@Injectable()
export class RazorpayGateway {
  private client: { keyId: string; keySecret: string; sdk: Razorpay } | null =
    null;

  constructor(
    @Inject(RazorpaySettingsService)
    private readonly source: RazorpayConfigSource,
  ) {}

  /** Current config, or null when payments are not configured / off. */
  async tryConfig(): Promise<RazorpayConfig | null> {
    return this.source.current();
  }

  async config(): Promise<RazorpayConfig> {
    const cfg = await this.source.current();
    if (!cfg) {
      throw new ServiceUnavailableException('Payments not configured');
    }
    return cfg;
  }

  private async sdk(): Promise<Razorpay> {
    const cfg = await this.config();
    // Rebuild the client when the keys were changed from the console.
    if (
      !this.client ||
      this.client.keyId !== cfg.keyId ||
      this.client.keySecret !== cfg.keySecret
    ) {
      this.client = {
        keyId: cfg.keyId,
        keySecret: cfg.keySecret,
        sdk: new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret }),
      };
    }
    return this.client.sdk;
  }

  async createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrder> {
    const order = await (await this.sdk()).orders.create(input);
    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
    };
  }

  /** Full refund of a captured payment (billing v2 Super Admin refunds). */
  async refundPayment(
    paymentId: string,
    amount: number,
    notes: Record<string, string> = {},
  ): Promise<{ id: string; amount: number; status: string }> {
    const r = await (
      await this.sdk()
    ).payments.refund(paymentId, {
      amount,
      notes,
    });
    return { id: r.id, amount: Number(r.amount), status: String(r.status) };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const p = await (await this.sdk()).payments.fetch(paymentId);
    return {
      id: p.id,
      order_id: p.order_id ?? null,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      error_description: p.error_description ?? null,
    };
  }
}
