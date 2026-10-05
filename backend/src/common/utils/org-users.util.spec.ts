import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (v: string) => `hashed:${v}`),
  compare: jest.fn(async () => true),
}));

const sendInviteEmail = jest.fn().mockResolvedValue({ success: true });
const sendUserAccountStatusEmail = jest.fn().mockResolvedValue({ success: true });
jest.mock('../../modules/email/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendInviteEmail,
    sendUserAccountStatusEmail,
  })),
}));

import {
  approveOrgUser,
  disapproveOrgUser,
  provisionInvitedUser,
  resendCredentials,
  setOrgUserStatus,
  updateOrgUser,
} from './org-users.util';

type Txn = {
  user: { create: jest.Mock; update: jest.Mock };
  userRole: { create: jest.Mock; deleteMany: jest.Mock };
  refreshToken: { updateMany: jest.Mock };
  role: { findFirst: jest.Mock };
};

function makePrisma() {
  const txn: Txn = {
    user: {
      create: jest.fn(async ({ data }: any) => ({
        id: 'new-user',
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        email: data.email,
        phoneNumber: data.phoneNumber ?? null,
        ...data,
      })),
      update: jest.fn(async ({ where, data }: any) => ({
        id: where.id,
        email: 'member@acme.test',
        firstName: 'Mem',
        lastName: 'Ber',
        phoneNumber: null,
        status: 'active',
        mustChangePassword: false,
        approvedAt: new Date(),
        ...data,
      })),
    },
    userRole: { create: jest.fn(), deleteMany: jest.fn() },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    role: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'role-1',
        key: 'sales',
        name: 'Sales',
      }),
    },
  };

  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: txn.user.update,
    },
    role: txn.role,
    userRole: txn.userRole,
    refreshToken: txn.refreshToken,
    passwordResetToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'prt-1' }),
    },
    organisation: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }),
    },
    // No subscription → the plan seat-limit check is skipped.
    subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (cb: (tx: Txn) => unknown) => cb(txn)),
  };
  return { prisma, txn };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('provisionInvitedUser', () => {
  it('creates the member as pending, unapproved and forced to change password', async () => {
    const { prisma, txn } = makePrisma();

    await provisionInvitedUser(prisma, 'org-1', {
      email: 'new@acme.test',
      firstName: 'New',
      lastName: 'Hire',
      phoneNumber: '+15551234567',
      role: 'sales',
    });

    expect(txn.user.create).toHaveBeenCalledTimes(1);
    const data = txn.user.create.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(data.approvedAt).toBeNull();
    expect(data.mustChangePassword).toBe(true);
    expect(data.passwordHash).not.toContain(' '); // hashed, never plaintext
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate email', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(
      provisionInvitedUser(prisma, 'org-1', {
        email: 'dupe@acme.test',
        role: 'sales',
      }),
    ).rejects.toThrow('This email is already assigned to another user.');
  });

  it('checks email duplicates case-insensitively and stores it lowercase', async () => {
    const { prisma, txn } = makePrisma();

    await provisionInvitedUser(prisma, 'org-1', {
      email: '  New.Hire@Acme.TEST ',
      phoneNumber: '+15551234567',
      role: 'sales',
    });

    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
      email: { equals: 'new.hire@acme.test', mode: 'insensitive' },
    });
    expect(txn.user.create.mock.calls[0][0].data.email).toBe(
      'new.hire@acme.test',
    );
  });

  it('rejects a duplicate mobile number', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst
      .mockResolvedValueOnce(null) // email free
      .mockResolvedValueOnce({ id: 'existing' }); // mobile taken
    await expect(
      provisionInvitedUser(prisma, 'org-1', {
        email: 'ok@acme.test',
        phoneNumber: '+15550000000',
        role: 'sales',
      }),
    ).rejects.toThrow('This mobile number is already assigned to another user.');
  });
});

describe('approveOrgUser', () => {
  it('stamps approvedAt but keeps status pending while a password change is still due', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'm1',
      orgId: 'org-1',
      email: 'm@acme.test',
      status: 'pending',
      approvedAt: null,
      mustChangePassword: true,
    });

    await approveOrgUser(prisma, 'org-1', 'm1');

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(data.approvedAt).toBeInstanceOf(Date);
    expect(sendUserAccountStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'activated' }),
    );
  });

  it('activates a member who has already changed their password', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'm1',
      orgId: 'org-1',
      email: 'm@acme.test',
      status: 'disabled',
      approvedAt: new Date(),
      mustChangePassword: false,
    });

    await approveOrgUser(prisma, 'org-1', 'm1');

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.status).toBe('active');
  });

  it('is a no-op for an already-active member', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'm1',
      orgId: 'org-1',
      status: 'active',
      approvedAt: new Date(),
      mustChangePassword: false,
    });

    await approveOrgUser(prisma, 'org-1', 'm1');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sendUserAccountStatusEmail).not.toHaveBeenCalled();
  });

  it('404s for a member outside the org', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(approveOrgUser(prisma, 'org-1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('disapproveOrgUser / setOrgUserStatus', () => {
  it('disables the member, revokes refresh tokens and stamps tokenInvalidBefore', async () => {
    const { prisma, txn } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'm1',
      orgId: 'org-1',
      status: 'active',
      userRoles: [{ role: { key: 'sales' } }],
    });

    await disapproveOrgUser(prisma, 'org-1', 'm1');

    const data = txn.user.update.mock.calls[0][0].data;
    expect(data.status).toBe('disabled');
    expect(data.tokenInvalidBefore).toBeInstanceOf(Date);
    expect(txn.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'm1', revokedAt: null } }),
    );
  });

  it('refuses to disable an admin-role member', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'm1',
      orgId: 'org-1',
      status: 'active',
      userRoles: [{ role: { key: 'admin' } }],
    });
    await expect(
      disapproveOrgUser(prisma, 'org-1', 'm1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not stamp tokenInvalidBefore when re-enabling', async () => {
    const { prisma, txn } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'm1',
      orgId: 'org-1',
      status: 'disabled',
      userRoles: [{ role: { key: 'sales' } }],
    });

    await setOrgUserStatus(prisma, 'org-1', 'm1', 'active');

    const data = txn.user.update.mock.calls[0][0].data;
    expect(data.status).toBe('active');
    expect(data.tokenInvalidBefore).toBeUndefined();
    expect(txn.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('updateOrgUser', () => {
  it('revokes sessions, stamps the token cutoff and emails when a password is set', async () => {
    const { prisma, txn } = makePrisma();
    prisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'm1',
        orgId: 'org-1',
        email: 'm@acme.test',
        phoneNumber: null,
        userRoles: [{ role: { key: 'sales' } }],
      })
      // getOrgUserById at the end
      .mockResolvedValueOnce({
        id: 'm1',
        orgId: 'org-1',
        email: 'm@acme.test',
        firstName: 'M',
        lastName: 'One',
        status: 'active',
        mustChangePassword: true,
        approvedAt: new Date(),
        createdAt: new Date(),
        onboardingStep: 'completed',
        userRoles: [{ role: { key: 'sales', name: 'Sales' } }],
        teamMembers: [],
      });

    await updateOrgUser(prisma, 'org-1', 'm1', { password: 'Str0ngPass!' });

    const data = txn.user.update.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(true);
    expect(data.tokenInvalidBefore).toBeInstanceOf(Date);
    expect(String(data.passwordHash)).toContain('hashed:');
    expect(txn.refreshToken.updateMany).toHaveBeenCalled();
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);
  });

  it('leaves sessions and email untouched for a plain profile edit', async () => {
    const { prisma, txn } = makePrisma();
    prisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'm1',
        orgId: 'org-1',
        email: 'm@acme.test',
        phoneNumber: null,
        userRoles: [{ role: { key: 'sales' } }],
      })
      .mockResolvedValueOnce({
        id: 'm1',
        orgId: 'org-1',
        email: 'm@acme.test',
        firstName: 'M',
        lastName: 'One',
        status: 'active',
        mustChangePassword: false,
        approvedAt: new Date(),
        createdAt: new Date(),
        onboardingStep: 'completed',
        userRoles: [{ role: { key: 'sales', name: 'Sales' } }],
        teamMembers: [],
      });

    await updateOrgUser(prisma, 'org-1', 'm1', { firstName: 'Renamed' });

    const data = txn.user.update.mock.calls[0][0].data;
    expect(data.tokenInvalidBefore).toBeUndefined();
    expect(txn.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
});

describe('resendCredentials', () => {
  it('re-issues a temp password for a member who never finished onboarding', async () => {
    const { prisma } = makePrisma();
    // resendCredentials -> findFirst; then reissueInvite -> findFirst
    prisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'm1',
        orgId: 'org-1',
        email: 'm@acme.test',
        status: 'pending',
        mustChangePassword: true,
      })
      .mockResolvedValueOnce({
        id: 'm1',
        orgId: 'org-1',
        email: 'm@acme.test',
        firstName: 'M',
        lastName: 'One',
      });

    await resendCredentials(prisma, 'org-1', 'm1');

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.mustChangePassword).toBe(true);
    expect(data.tokenInvalidBefore).toBeInstanceOf(Date);
    expect(String(data.passwordHash)).toContain('hashed:');
    expect(sendInviteEmail).toHaveBeenCalledTimes(1);
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('rejects resend for a fully-onboarded active member', async () => {
    const { prisma } = makePrisma();
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'm1',
      orgId: 'org-1',
      email: 'm@acme.test',
      firstName: 'M',
      lastName: 'One',
      status: 'active',
      mustChangePassword: false,
    });

    await expect(resendCredentials(prisma, 'org-1', 'm1')).rejects.toThrow(
      'Resend Mail is only available until the user completes onboarding.',
    );

    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('updateOrgUser mobile number', () => {
  const member = {
    id: 'm1',
    orgId: 'org-1',
    email: 'm@acme.test',
    phoneNumber: '9876543210', // older record, saved without country code
    userRoles: [{ role: { key: 'sales' } }],
  };

  it("keeps the user's own number when the form re-sends it with a country code", async () => {
    const { prisma, txn } = makePrisma();
    prisma.user.findFirst
      .mockResolvedValueOnce(member)
      // a different user stores the same number with +91
      .mockResolvedValue({ id: 'other', phoneNumber: '+919876543210' });

    await updateOrgUser(prisma, 'org-1', 'm1', {
      phoneNumber: '+919876543210',
      role: 'telecaller',
    }).catch(() => undefined); // trailing reload is not under test

    expect(txn.user.update).toHaveBeenCalledTimes(1);
    expect(txn.user.update.mock.calls[0][0].data.phoneNumber).toBeUndefined();
  });

  it('still rejects a number that belongs to another user', async () => {
    const { prisma, txn } = makePrisma();
    prisma.user.findFirst
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce({ id: 'other' }); // mobile taken

    await expect(
      updateOrgUser(prisma, 'org-1', 'm1', { phoneNumber: '+919999999999' }),
    ).rejects.toThrow('This mobile number is already assigned to another user.');
    expect(txn.user.update).not.toHaveBeenCalled();
  });
});
