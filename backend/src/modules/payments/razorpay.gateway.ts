import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import Razorpay from 'razorpay';
import { RAZORPAY_CONFIG, type RazorpayConfig } from './razorpay.config';

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

/**
 * Thin wrapper over the Razorpay SDK so PaymentsService can be unit-tested
 * with a fake. Every call goes through config(), which turns "no keys" into
 * a 503 instead of a crash.
 */
@Injectable()
export class RazorpayGateway {
  private client: Razorpay | null = null;

  constructor(
    @Inject(RAZORPAY_CONFIG) private readonly cfg: RazorpayConfig | null,
  ) {}

  get enabled(): boolean {
    return this.cfg !== null;
  }

  config(): RazorpayConfig {
    if (!this.cfg) {
      throw new ServiceUnavailableException('Payments not configured');
    }
    return this.cfg;
  }

  private sdk(): Razorpay {
    const cfg = this.config();
    this.client ??= new Razorpay({
      key_id: cfg.keyId,
      key_secret: cfg.keySecret,
    });
    return this.client;
  }

  async createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<GatewayOrder> {
    const order = await this.sdk().orders.create(input);
    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
    };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const p = await this.sdk().payments.fetch(paymentId);
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
