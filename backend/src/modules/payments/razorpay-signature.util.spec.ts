import { createHmac } from 'crypto';
import {
  isValidCheckoutSignature,
  isValidWebhookSignature,
} from './razorpay-signature.util';

const KEY_SECRET = 'test_key_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';

function sign(secret: string, data: string | Buffer) {
  return createHmac('sha256', secret).update(data).digest('hex');
}

describe('isValidCheckoutSignature', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';
  const valid = sign(KEY_SECRET, `${orderId}|${paymentId}`);

  it('accepts the HMAC of order_id|payment_id', () => {
    expect(
      isValidCheckoutSignature(orderId, paymentId, valid, KEY_SECRET),
    ).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    const forged = sign('other_secret', `${orderId}|${paymentId}`);
    expect(
      isValidCheckoutSignature(orderId, paymentId, forged, KEY_SECRET),
    ).toBe(false);
  });

  it('rejects a valid signature replayed for a different payment', () => {
    expect(
      isValidCheckoutSignature(orderId, 'pay_OTHER', valid, KEY_SECRET),
    ).toBe(false);
  });

  it.each([undefined, null, '', 'abc'])('rejects %p', (sig) => {
    expect(isValidCheckoutSignature(orderId, paymentId, sig, KEY_SECRET)).toBe(
      false,
    );
  });
});

describe('isValidWebhookSignature', () => {
  const raw = Buffer.from('{"event":"payment.captured","payload":{}}');
  const valid = sign(WEBHOOK_SECRET, raw);

  it('accepts the HMAC of the raw body', () => {
    expect(isValidWebhookSignature(raw, valid, WEBHOOK_SECRET)).toBe(true);
  });

  it('rejects when the body was altered (e.g. re-serialised JSON)', () => {
    const reserialised = Buffer.from(
      JSON.stringify(JSON.parse(raw.toString()), null, 1),
    );
    expect(isValidWebhookSignature(reserialised, valid, WEBHOOK_SECRET)).toBe(
      false,
    );
  });

  it('rejects a wrong secret, a missing signature and a missing body', () => {
    expect(
      isValidWebhookSignature(raw, sign('nope', raw), WEBHOOK_SECRET),
    ).toBe(false);
    expect(isValidWebhookSignature(raw, undefined, WEBHOOK_SECRET)).toBe(false);
    expect(isValidWebhookSignature(undefined, valid, WEBHOOK_SECRET)).toBe(
      false,
    );
  });
});
