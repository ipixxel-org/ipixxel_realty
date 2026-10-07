import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { TeamChatController } from './team-chat.controller';
import { TeamChatAccessService } from './team-chat-access.service';
import { TeamChatConversationsService } from './team-chat-conversations.service';
import { TeamChatMessagesService } from './team-chat-messages.service';
import { TeamChatAttachmentsService } from './team-chat-attachments.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamChatController],
  providers: [
    TeamChatAccessService,
    TeamChatConversationsService,
    TeamChatMessagesService,
    TeamChatAttachmentsService,
    OrgApprovedGuard,
    PermissionGuard,
  ],
})
export class TeamChatModule {}
