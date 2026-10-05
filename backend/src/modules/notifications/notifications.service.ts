import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Platform console inbox. A Super Admin sees the shared platform inbox
  // (rows addressed to "all super admins", recipientId null) plus their own;
  // any other Platform Team member (e.g. Platform Operator) sees only rows
  // addressed to them personally (e.g. a support ticket assigned to them).
  private async platformInboxWhere(
    recipientId: string,
  ): Promise<Prisma.NotificationWhereInput> {
    const superAdmin = await this.prisma.userRole.count({
      where: { userId: recipientId, role: { key: 'super_admin', orgId: null } },
    });
    return superAdmin > 0
      ? { OR: [{ recipientId: null }, { recipientId }] }
      : { recipientId };
  }

  async list(recipientId: string, query: { page?: number; limit?: number; unreadOnly?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.NotificationWhereInput = await this.platformInboxWhere(recipientId);
    if (query.unreadOnly === 'true') where.readAt = null;
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organisation: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async unreadCount(recipientId: string) {
    const count = await this.prisma.notification.count({
      where: { ...(await this.platformInboxWhere(recipientId)), readAt: null },
    });
    return { count };
  }

  async markRead(id: string, recipientId: string) {
    const notif = await this.prisma.notification.findFirst({
      where: { id, ...(await this.platformInboxWhere(recipientId)) },
    });
    if (!notif) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(recipientId: string) {
    await this.prisma.notification.updateMany({
      where: { ...(await this.platformInboxWhere(recipientId)), readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Org member's own inbox (GET /org/notifications and friends). Unlike the
  // Super Admin inbox there's no "broadcast" grouping — every notification an
  // org member sees names them specifically as recipientId, so this is a
  // plain (orgId, recipientId) scope. Currently only support-ticket events
  // (a Platform Team reply, or a ticket being marked resolved) populate it.
  // -------------------------------------------------------------------------

  async listForOrgUser(
    orgId: string,
    recipientId: string,
    query: { page?: number; limit?: number; unreadOnly?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      orgId,
      recipientId,
      ...(query.unreadOnly === 'true' ? { readAt: null } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async unreadCountForOrgUser(orgId: string, recipientId: string) {
    const count = await this.prisma.notification.count({
      where: { orgId, recipientId, readAt: null },
    });
    return { count };
  }

  async markReadForOrgUser(id: string, orgId: string, recipientId: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.orgId !== orgId || notif.recipientId !== recipientId) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllReadForOrgUser(orgId: string, recipientId: string) {
    await this.prisma.notification.updateMany({
      where: { orgId, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
