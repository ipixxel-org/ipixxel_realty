import { Logger, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsService } from './payments.service';
import { PaymentEventsService } from './payment-events';
import { RazorpayGateway } from './razorpay.gateway';
import { RazorpaySettingsService } from './razorpay-settings.service';
import {
  RAZORPAY_CONFIG,
  loadRazorpayConfig,
  webhookSecretProblem,
} from './razorpay.config';
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
        const problem =
          cfg &&
          webhookSecretProblem(cfg.keyId, cfg.keySecret, cfg.webhookSecret);
        if (problem) {
          // Unsafe, not partial: don't block the boot, just don't use it.
          logger.error(`RAZORPAY_* env keys ignored: ${problem}`);
          return null;
        }
        if (cfg) logger.log(`Razorpay env fallback loaded (${cfg.mode} mode)`);
        else
          logger.warn(
            'No RAZORPAY_* env keys — using keys from Integrations → Razorpay if saved there.',
          );
        return cfg;
      },
    },
    RazorpaySettingsService,
    RazorpayGateway,
    PaymentEventsService,
    PaymentsService,
  ],
  exports: [PaymentsService, PaymentEventsService, RazorpaySettingsService],
})
export class PaymentsModule {}
