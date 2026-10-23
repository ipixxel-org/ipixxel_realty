import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveAdminPlanDto } from './save-admin-plan.dto';

/**
 * The Super Admin plan editor sends back the plan exactly as it was loaded
 * (GET /admin/billing/plans), read-only fields included. The global pipe
 * rejects unknown properties, so every field of that shape must be accepted.
 */
describe('SaveAdminPlanDto', () => {
  const loaded = {
    id: 'demo',
    name: 'Demo',
    tagline: 'Internal',
    priceMonthly: 499,
    priceYearly: 4990,
    isFree: false,
    isActive: true,
    rank: 1,
    limits: { users: 5, projects: 2, landingPages: 1, templates: null },
    modules: {
      teamChat: true,
      metaLeadAds: false,
      metaPages: null,
      whatsapp: false,
      aiCalling: false,
    },
  };

  it('accepts the plan as loaded (isActive included)', async () => {
    const errors = await validate(plainToInstance(SaveAdminPlanDto, loaded), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });
});
