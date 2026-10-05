import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';
import {
  AdminPresenceController,
  PresenceController,
} from './presence.controller';
import { PresenceService } from './presence.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PresenceController, AdminPresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}
