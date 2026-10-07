import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { TeamChatConversationsService } from './team-chat-conversations.service';
import { TeamChatMessagesService } from './team-chat-messages.service';
import { TeamChatAttachmentsService } from './team-chat-attachments.service';
import {
  AddMembersDto,
  CreateChannelDto,
  CreateDmDto,
  EditMessageDto,
  ForwardMessageDto,
  ListMessagesQueryDto,
  MarkReadDto,
  PresignAttachmentDto,
  ReactionDto,
  RenameChannelDto,
  SearchMessagesQueryDto,
  SearchQueryDto,
  SendMessageDto,
} from './dto/team-chat.dto';

const uuid = new ParseUUIDPipe();

/**
 * Team Chat REST API. Every route needs team_chat:view (class level); add /
 * delete are raised per route. Edit-type rights (rename, members) are
 * "channel admin OR team_chat:edit" and are checked in the service. On top
 * of all of that, every conversation is reached only through the caller's
 * own membership — see TeamChatAccessService.
 */
@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@RequirePermission('team_chat', 'view')
@Controller('org/team-chat')
export class TeamChatController {
  constructor(
    private readonly conversations: TeamChatConversationsService,
    private readonly messages: TeamChatMessagesService,
    private readonly attachments: TeamChatAttachmentsService,
  ) {}

  // --- Conversations -------------------------------------------------------

  @Get('conversations')
  list(@CurrentUser() user: JwtPayload) {
    return this.conversations.list(user);
  }

  @Get('conversations/:id')
  getOne(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.conversations.getOne(user, id);
  }

  @Get('conversations/:id/members')
  members(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.conversations.members(user, id);
  }

  @Post('channels')
  @RequirePermission('team_chat', 'add')
  createChannel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateChannelDto,
  ) {
    return this.conversations.createChannel(user, dto);
  }

  @Patch('channels/:id')
  renameChannel(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Body() dto: RenameChannelDto,
  ) {
    return this.conversations.renameChannel(user, id, dto);
  }

  @Delete('channels/:id')
  @RequirePermission('team_chat', 'delete')
  deleteChannel(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
  ) {
    return this.conversations.deleteChannel(user, id);
  }

  @Post('channels/:id/members')
  addMembers(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.conversations.addMembers(user, id, dto);
  }

  @Delete('channels/:id/members/:userId')
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
  ) {
    return this.conversations.removeMember(user, id, userId);
  }

  @Post('channels/:id/leave')
  @HttpCode(200)
  leave(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.conversations.leave(user, id);
  }

  @Post('dms')
  openDm(@CurrentUser() user: JwtPayload, @Body() dto: CreateDmDto) {
    return this.conversations.openDm(user, dto);
  }

  @Get('search')
  search(@CurrentUser() user: JwtPayload, @Query() q: SearchQueryDto) {
    return this.conversations.search(user, q.q);
  }

  // --- Messages ------------------------------------------------------------

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Query() q: ListMessagesQueryDto,
  ) {
    return this.messages.list(user, id, q);
  }

  @Get('conversations/:id/messages/search')
  searchMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Query() q: SearchMessagesQueryDto,
  ) {
    return this.messages.search(user, id, q);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(user, id, dto);
  }

  @Get('conversations/:id/pins')
  pins(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.messages.pins(user, id);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.messages.markRead(user, id, dto);
  }

  @Patch('messages/:id')
  edit(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messages.edit(user, id, dto);
  }

  // Own messages need only view; others' team_chat:delete (service-checked).
  @Delete('messages/:id')
  remove(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.messages.remove(user, id);
  }

  @Post('messages/:id/pin')
  @HttpCode(200)
  pin(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.messages.pin(user, id);
  }

  @Delete('messages/:id/pin')
  unpin(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.messages.unpin(user, id);
  }

  @Post('messages/:id/forward')
  forward(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.messages.forward(user, id, dto.conversationIds);
  }

  @Put('messages/:id/reaction')
  react(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
    @Body() dto: ReactionDto,
  ) {
    return this.messages.react(user, id, dto.emoji);
  }

  @Delete('messages/:id/reaction')
  unreact(@CurrentUser() user: JwtPayload, @Param('id', uuid) id: string) {
    return this.messages.unreact(user, id);
  }

  // --- Attachments ---------------------------------------------------------

  @Post('attachments/presign')
  presign(@CurrentUser() user: JwtPayload, @Body() dto: PresignAttachmentDto) {
    return this.attachments.presign(user, dto);
  }

  /** Cancel an upload that hasn't been sent (own uploads only). */
  @Delete('attachments/:id')
  cancelAttachment(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
  ) {
    return this.attachments.cancel(user, id);
  }

  @Get('attachments/:id/url')
  attachmentUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid) id: string,
  ) {
    return this.attachments.downloadUrl(user, id);
  }
}
