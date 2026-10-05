import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { orgBillingRecipientsWhere } from '../../common/utils/notification-recipients.util';

function makeService(isSuperAdmin: boolean) {
  const prisma: any = {
    userRole: { count: jest.fn().mockResolvedValue(isSuperAdmin ? 1 : 0) },
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  return { service: new NotificationsService(prisma), prisma };
}

describe('NotificationsService platform inbox', () => {
  it('gives a Super Admin the shared inbox plus their own rows', async () => {
    const { service, prisma } = makeService(true);
    await service.list('sa1', {});
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ recipientId: null }, { recipientId: 'sa1' }],
    });
  });

  it('gives any other Platform Team member only their own rows', async () => {
    const { service, prisma } = makeService(false);
    await service.list('op1', { unreadOnly: 'true' });
    await service.unreadCount('op1');
    await service.markAllRead('op1');
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
      recipientId: 'op1',
      readAt: null,
    });
    expect(prisma.notification.count.mock.calls[1][0].where).toEqual({
      recipientId: 'op1',
      readAt: null,
    });
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
      recipientId: 'op1',
      readAt: null,
    });
  });

  it("won't let a non-Super Admin mark a shared notification read", async () => {
    const { service, prisma } = makeService(false);
    await expect(service.markRead('n1', 'op1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.findFirst.mock.calls[0][0].where).toEqual({
      id: 'n1',
      recipientId: 'op1',
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});

describe('orgBillingRecipientsWhere', () => {
  it('targets active org Admins, plus the requester when given', () => {
    expect(orgBillingRecipientsWhere('org1')).toEqual({
      orgId: 'org1',
      status: 'active',
      OR: [{ userRoles: { some: { role: { key: 'admin' } } } }],
    });
    expect(orgBillingRecipientsWhere('org1', 'u9').OR).toContainEqual({ id: 'u9' });
  });
});
