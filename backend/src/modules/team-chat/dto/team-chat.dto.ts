import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_CHANNEL_NAME = 80;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CHANNEL_NAME)
  name: string;

  /** Other members to add (the creator is always added, as admin). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  memberIds?: string[];
}

export class RenameChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CHANNEL_NAME)
  name: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  userIds: string[];
}

export class CreateDmDto {
  @IsUUID()
  userId: string;
}

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q: string;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export class ListMessagesQueryDto {
  /** Older history: messages strictly before this cursor. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  before?: string;

  /** Reconnect catch-up: messages strictly after this cursor. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  after?: string;

  /** Jump-to-message: a page centred on this message id. */
  @IsOptional()
  @IsUUID()
  around?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SearchMessagesQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SendMessageDto {
  /** May be empty only when attachments are sent (B9). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body?: string;

  /** Client-generated id; a retry with the same id returns the original
   *  message instead of posting twice (B8). */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, {
    message: 'clientMsgId must be 8-64 letters, digits, - or _',
  })
  clientMsgId: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  mentionUserIds?: string[];
}

export class EditMessageDto {
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body: string;

  /** Replaces the message's mentions when present. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  mentionUserIds?: string[];
}

export class ForwardMessageDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  conversationIds: string[];
}

export class MarkReadDto {
  /** Read up to and including this message; omitted = the latest. */
  @IsOptional()
  @IsUUID()
  messageId?: string;
}

export class ReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  emoji: string;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export class PresignAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  /** Any type; '' (unknown) is stored as application/octet-stream. */
  @IsString()
  @MaxLength(255)
  mimeType: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  size: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSec?: number;
}
