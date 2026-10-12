import { createHmac, timingSafeEqual } from 'crypto';

// Constant-time HMAC-SHA256 checks for Razorpay. Written here rather than
// using the SDK's validate* helpers because those compare with `===`.

function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqualHex(
  expected: string,
  received: string | undefined | null,
): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received.trim(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout success handler: HMAC(key_secret, `${order_id}|${payment_id}`). */
export function isValidCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string | undefined | null,
  keySecret: string,
): boolean {
  return safeEqualHex(hmacHex(keySecret, `${orderId}|${paymentId}`), signature);
}

/** Webhook: HMAC(webhook_secret, raw request body), X-Razorpay-Signature. */
export function isValidWebhookSignature(
  rawBody: Buffer | string | undefined | null,
  signature: string | undefined | null,
  webhookSecret: string,
): boolean {
  if (!rawBody || rawBody.length === 0) return false;
  return safeEqualHex(hmacHex(webhookSecret, rawBody), signature);
}
