import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MetaLeadsModule } from '../meta-leads/meta-leads.module';
import { GoogleSheetsModule } from './google-sheets.module';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { MarketingService } from './marketing.service';
import { MarketingSyncService } from './marketing-sync.service';
import {
  AdminMarketingController,
  MarketingOAuthController,
  OrgMarketingController,
} from './marketing.controller';
import { GoogleSheetsWebhookController } from './google-sheets-webhook.controller';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { MetaAdapter } from './adapters/meta.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { WhatsappAdapter } from './adapters/whatsapp.adapter';
import { GoogleAdsAdapter } from './adapters/google-ads.adapter';
import { GoogleSheetsAdapter } from './adapters/google-sheets.adapter';

@Module({
  imports: [AuthModule, GoogleSheetsModule, forwardRef(() => MetaLeadsModule)],
  controllers: [
    AdminMarketingController,
    OrgMarketingController,
    MarketingOAuthController,
    GoogleSheetsWebhookController,
  ],
  providers: [
    MarketingService,
    MarketingSyncService,
    OrgApprovedGuard,
    PlatformAdapterRegistry,
    MetaAdapter,
    InstagramAdapter,
    WhatsappAdapter,
    GoogleAdsAdapter,
    GoogleSheetsAdapter,
  ],
  exports: [
    MarketingService,
    MarketingSyncService,
    GoogleSheetsModule,
    PlatformAdapterRegistry,
  ],
})
export class MarketingModule {}
