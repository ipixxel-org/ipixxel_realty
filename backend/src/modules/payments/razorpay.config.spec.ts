import { loadRazorpayConfig } from './razorpay.config';

describe('loadRazorpayConfig', () => {
  const full = {
    RAZORPAY_KEY_ID: 'rzp_test_AbC123',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_WEBHOOK_SECRET: 'whsec',
  };

  it('returns null (payments disabled) when nothing is set', () => {
    expect(loadRazorpayConfig({})).toBeNull();
    expect(loadRazorpayConfig({ RAZORPAY_KEY_ID: '  ' })).toBeNull();
  });

  it('parses a full test config', () => {
    expect(loadRazorpayConfig(full)).toEqual({
      keyId: 'rzp_test_AbC123',
      keySecret: 'secret',
      webhookSecret: 'whsec',
      mode: 'test',
    });
  });

  it('detects live mode', () => {
    expect(
      loadRazorpayConfig({ ...full, RAZORPAY_KEY_ID: 'rzp_live_X9' })?.mode,
    ).toBe('live');
  });

  it('refuses a partial config', () => {
    expect(() =>
      loadRazorpayConfig({ ...full, RAZORPAY_WEBHOOK_SECRET: '' }),
    ).toThrow(/partly configured/);
  });

  it('refuses a malformed key id', () => {
    expect(() =>
      loadRazorpayConfig({ ...full, RAZORPAY_KEY_ID: 'pk_test_123' }),
    ).toThrow(/malformed/);
  });
});
