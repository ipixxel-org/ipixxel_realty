import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { PresignAttachmentDto } from './dto/team-chat.dto';

const MB = 1024 * 1024;

/** TEAM_CHAT_MAX_ATTACHMENT_MB, default 100. */
export function maxAttachmentBytes(): number {
  const mb = Number(process.env.TEAM_CHAT_MAX_ATTACHMENT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 100) * MB;
}

/** Rendered in the browser only for types that can't carry script; SVG and
 *  everything else is always served as a download. */
function isInlineSafe(mimeType: string): boolean {
  return (
    (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') ||
    mimeType.startsWith('video/')
  );
}

@Injectable()
export class TeamChatAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Any file type. Creates the attachment row up front (unlinked); sending a
   * message with its id links it. Objects go to the private bucket only.
   */
  async presign(actor: JwtPayload, dto: PresignAttachmentDto) {
    const orgId = actor.orgId as string;
    const upload = await this.storage.createPrivateUploadUrl({
      orgId,
      scope: 'team-chat',
      filename: dto.fileName,
      contentType: dto.mimeType,
      size: dto.size,
      maxBytes: maxAttachmentBytes(),
    });
    const attachment = await this.prisma.teamMessageAttachment.create({
      data: {
        orgId,
        uploadedById: actor.sub,
        storageKey: upload.key,
        fileName: dto.fileName.trim().slice(0, 255) || 'file',
        mimeType: upload.contentType,
        sizeBytes: dto.size,
        width: dto.width ?? null,
        height: dto.height ?? null,
        durationSec: dto.durationSec ?? null,
      },
    });
    return {
      attachmentId: attachment.id,
      uploadUrl: upload.uploadUrl,
      // The PUT must send exactly this Content-Type (it's signed).
      headers: { 'Content-Type': upload.contentType },
      expiresIn: upload.expiresIn,
      maxBytes: maxAttachmentBytes(),
    };
  }

  /**
   * Short-lived signed GET URL. Allowed when the attachment belongs to a
   * live (not deleted) message in a conversation the caller is a member of,
   * or is the caller's own not-yet-sent upload. Everything else 404s.
   */
  async downloadUrl(actor: JwtPayload, attachmentId: string) {
    const orgId = actor.orgId as string;
    const att = await this.prisma.teamMessageAttachment.findFirst({
      where: { id: attachmentId, orgId },
      include: { message: { select: { channelId: true, deletedAt: true } } },
    });
    if (!att) throw new NotFoundException('Attachment not found');

    if (att.message) {
      const member = await this.prisma.teamChannelMember.findFirst({
        where: { channelId: att.message.channelId, userId: actor.sub, orgId },
        select: { userId: true },
      });
      if (!member || att.message.deletedAt) {
        throw new NotFoundException('Attachment not found');
      }
    } else if (att.uploadedById !== actor.sub) {
      throw new NotFoundException('Attachment not found');
    }

    const { url, expiresIn } = await this.storage.createPrivateDownloadUrl({
      key: att.storageKey,
      fileName: att.fileName,
      contentType: att.mimeType,
      disposition: isInlineSafe(att.mimeType) ? 'inline' : 'attachment',
    });
    return { url, expiresIn, fileName: att.fileName, mimeType: att.mimeType };
  }
}
