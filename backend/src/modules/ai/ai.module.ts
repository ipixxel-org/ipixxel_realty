import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AdminAiSettingsController } from './admin-ai-settings.controller';
import { AiService } from './ai.service';
import { AiSettingsService } from './ai-settings.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AiController, AdminAiSettingsController],
  providers: [AiService, AiSettingsService],
  exports: [AiService, AiSettingsService],
})
export class AiModule {}
