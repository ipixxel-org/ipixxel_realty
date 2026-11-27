import { describe, expect, it } from '@jest/globals';
import { leadContactFromData, normalizeLeadData } from './lead-data.util';

describe('normalizeLeadData', () => {
  it('maps builder form labels onto canonical fields without duplicate aliases', () => {
    const next = normalizeLeadData(
      {
        'Full name': 'Ananya Mehta',
        'Phone number': '+91 98765 43101',
        'Email address': 'ananya@example.com',
        'Interested in': '3 BHK',
        Project: 'Skyline Heights',
      },
      { projectName: 'Skyline Heights' },
    );

    expect(next.fullName).toBe('Ananya Mehta');
    expect(next.name).toBeUndefined();
    expect(next.phone).toBe('+91 98765 43101');
    expect(next['Phone number']).toBeUndefined();
    expect(next.email).toBe('ananya@example.com');
    expect(next['Email address']).toBeUndefined();
    expect(next.interestedIn).toBe('3 BHK');
    expect(next['Interested in']).toBeUndefined();
    expect(next.project).toBe('Skyline Heights');
    expect(next.Project).toBeUndefined();
  });

  it('keeps a custom alias-shaped field when its value is distinct', () => {
    const next = normalizeLeadData({ fullName: 'Ananya Mehta', Name: 'Referral name', Notes: 'VIP' });

    expect(next.fullName).toBe('Ananya Mehta');
    expect(next.Name).toBe('Referral name');
    expect(next.Notes).toBe('VIP');
  });

  it('ignores a consent "yes" that overwrote the phone slot', () => {
    // A "Contact me on WhatsApp" checkbox used to write phone: "yes".
    const next = normalizeLeadData({
      fullName: 'Raman Mohanty',
      phone: 'yes',
      phoneNumber: 'yes',
      'Phone Number': '6370548284',
      'Contact me on WhatsApp': 'yes',
    });
    expect(next.phone).toBe('6370548284');
    expect(leadContactFromData({ phone: 'yes' }).phone).toBeNull();
  });
});
