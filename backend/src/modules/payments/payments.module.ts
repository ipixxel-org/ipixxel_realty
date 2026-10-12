import { Logger, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsService } from './payments.service';
import { PaymentEventsService } from './payment-events';
import { RazorpayGateway } from './razorpay.gateway';
import { RAZORPAY_CONFIG, loadRazorpayConfig } from './razorpay.config';
import {
  AdminPaymentsController,
  OrgPaymentsController,
  RazorpayWebhookController,
} from './payments.controller';

/**
 * Generic Razorpay payments. Other modules import PaymentsModule and call
 * PaymentsService.createOrder() / subscribe via PaymentEventsService.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    OrgPaymentsController,
    AdminPaymentsController,
    RazorpayWebhookController,
  ],
  providers: [
    {
      provide: RAZORPAY_CONFIG,
      // Throws (and so stops the boot) on partial/malformed config.
      useFactory: () => {
        const cfg = loadRazorpayConfig();
        const logger = new Logger('Razorpay');
        if (cfg) logger.log(`Razorpay enabled (${cfg.mode} mode)`);
        else
          logger.warn(
            'Razorpay keys not set — payment endpoints will return 503.',
          );
        return cfg;
      },
    },
    RazorpayGateway,
    PaymentEventsService,
    PaymentsService,
  ],
  exports: [PaymentsService, PaymentEventsService],
})
export class PaymentsModule {}
