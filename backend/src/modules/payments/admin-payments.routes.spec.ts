import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { AdminPaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpaySettingsService } from './razorpay-settings.service';

/** The ₹1 test payment is gone: POST /admin/payments/test-order no longer exists. */
describe('Super Admin payments routes', () => {
  let app: INestApplication<App>;
  const service = {
    adminListPayments: jest.fn(() => Promise.resolve({ data: [] })),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [AdminPaymentsController],
      providers: [
        { provide: PaymentsService, useValue: service },
        { provide: RazorpaySettingsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /admin/payments/test-order is 404', async () => {
    await request(app.getHttpServer())
      .post('/admin/payments/test-order')
      .send({ organisationId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('GET /admin/payments is still there', async () => {
    await request(app.getHttpServer()).get('/admin/payments').expect(200);
    expect(service.adminListPayments).toHaveBeenCalled();
  });
});
