import { isSamePhoneNumber } from './phone.util';

describe('isSamePhoneNumber', () => {
  it('matches the same number in the same or a different format', () => {
    expect(isSamePhoneNumber('+919876543210', '+919876543210')).toBe(true);
    expect(isSamePhoneNumber('+91 98765 43210', '+919876543210')).toBe(true);
    // Older records were saved without the country code.
    expect(isSamePhoneNumber('9876543210', '+919876543210')).toBe(true);
    expect(isSamePhoneNumber('+919876543210', '9876543210')).toBe(true);
    expect(isSamePhoneNumber('5551234567', '+15551234567')).toBe(true);
  });

  it('treats a genuinely different number as a change', () => {
    expect(isSamePhoneNumber('9876543210', '+919876543211')).toBe(false);
    expect(isSamePhoneNumber('+919876543210', '+449876543210')).toBe(false);
    expect(isSamePhoneNumber('9876543210', '9876543211')).toBe(false);
    expect(isSamePhoneNumber('76543210', '+919876543210')).toBe(false);
    expect(isSamePhoneNumber(null, '+919876543210')).toBe(false);
    expect(isSamePhoneNumber('9876543210', '')).toBe(false);
  });
});
