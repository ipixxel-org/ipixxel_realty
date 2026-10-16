/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await -- test-only Prisma fakes: rows are untyped on purpose */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { applyRetention } from '../../common/utils/retention.util';
import { assertOrgSessionActive } from '../../common/guards/org-approved.guard';
import { ProjectEditableGuard } from '../../common/guards/project-editable.guard';
import {
  approveOrgUser,
  setOrgUserStatus,
} from '../../common/utils/org-users.util';
import { AuthService } from '../auth/auth.service';
import { OrgLandingPagesService } from '../org-landing-pages/org-landing-pages.service';
import { createFakeBillingDb } from '../../../test/fakes/fake-billing-db';

/** The error body a Nest HttpException carries. */
const body = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    return (e as ForbiddenException).getResponse?.() as Record<string, any>;
  }
  return null;
};

describe('a paused user (plan user limit is lower)', () => {
  const PAUSED_AT = new Date('2026-10-14T00:00:00Z');

  it('is paused by "choose what stays" and every session ends (refresh tokens revoked)', async () => {
    const member = (id: string, createdAt: number) => ({
      id,
      orgId: 'org-1',
      status: 'active',
      firstName: id,
      lastName: null,
      email: `${id}@acme.test`,
      billingPausedAt: null,
      createdAt: new Date(createdAt),
      userRoles: [{ role: { key: 'sales', name: 'Sales' } }],
    });
    const { db } = createFakeBillingDb({
      plans: [],
      subscription: null,
      users: [member('u-1', 1), member('u-2', 2)],
    });
    db.refreshToken.rows.push(
      { id: 'rt-1', userId: 'u-2', revokedAt: null, createdAt: new Date(5) },
      { id: 'rt-2', userId: 'u-1', revokedAt: null, createdAt: new Date(9) },
    );
    // Basic allows 2 users: the owner and the most recent sign-in stay.
    const res = await applyRetention(
      db as never,
      'org-1',
      { id: 'basic', limits: { users: 2, projects: 1, landingPages: 1 } },
      PAUSED_AT,
    );
    expect(res.paused.users).toBe(1);
    const paused = db.user.rows.find((u: any) => u.billingPausedAt);
    expect(paused.id).toBe('u-2');
    expect(
      db.refreshToken.rows.find((t: any) => t.userId === 'u-2').revokedAt,
    ).toEqual(PAUSED_AT);
    expect(
      db.refreshToken.rows.find((t: any) => t.userId === 'u-1').revokedAt,
    ).toBeNull();
  });

  function auth(user: Record<string, any>) {
    const prisma: any = {
      user: {
        findUnique: jest.fn(async ({ select }: any) =>
          select?.billingPausedAt
            ? { billingPausedAt: user.billingPausedAt }
            : user,
        ),
        findFirst: jest.fn(async () => ({
          firstName: 'Asha',
          lastName: 'Rao',
          email: 'asha@acme.test',
        })),
      },
      organisation: {
        findUnique: jest.fn(async () => ({
          name: 'Acme Realty',
          status: 'active',
        })),
      },
      subscription: {
        findFirst: jest.fn(async () => ({
          plan: { name: 'Basic', limits: { users: 2 } },
        })),
      },
      refreshToken: {
        findFirst: jest.fn(async () => ({
          id: 'rt',
          userId: user.id,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        })),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const jwt = { sign: jest.fn(() => 'jwt') };
    return {
      service: new AuthService(prisma, jwt as never, {} as never),
      prisma,
    };
  }

  it("can't sign in: the login is refused with account_paused and what the login page shows", async () => {
    const user = {
      id: 'u-2',
      orgId: 'org-1',
      firstName: 'Ravi',
      lastName: null,
      email: 'ravi@acme.test',
      phoneNumber: null,
      passwordHash: await bcrypt.hash('secret-pw', 4),
      status: 'active',
      mustChangePassword: false,
      approvedAt: new Date(),
      createdAt: new Date(),
      onboardingStep: 'completed',
      userRoles: [{ role: { key: 'sales' } }],
      billingPausedAt: PAUSED_AT,
    };
    const { service } = auth(user);
    const err = await body(
      service.login({
        email: 'ravi@acme.test',
        password: 'secret-pw',
      } as never),
    );
    expect(err).toMatchObject({
      statusCode: 403,
      code: 'account_paused',
      orgName: 'Acme Realty',
      ownerName: 'Asha Rao',
      planName: 'Basic',
      planUserLimit: 2,
    });
  });

  it("can't keep a session: refresh is refused and an existing access token is rejected", async () => {
    const user = {
      id: 'u-2',
      orgId: 'org-1',
      status: 'active',
      billingPausedAt: PAUSED_AT,
      userRoles: [],
    };
    const { service } = auth(user);
    await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const prisma: any = {
      organisation: { findUnique: async () => ({ status: 'active' }) },
      user: {
        findUnique: async () => ({
          status: 'active',
          mustChangePassword: false,
          tokenInvalidBefore: null,
          onboardingStep: 'completed',
          billingPausedAt: PAUSED_AT,
        }),
      },
    };
    const err = await body(
      assertOrgSessionActive(prisma, { sub: 'u-2', orgId: 'org-1' } as never),
    );
    expect(err).toMatchObject({ statusCode: 403, error: 'USER_INACTIVE' });
  });

  it("can't be re-activated from the user screens — only Change what stays or an upgrade", async () => {
    const row = {
      id: 'u-2',
      orgId: 'org-1',
      status: 'disabled',
      approvedAt: new Date(),
      mustChangePassword: false,
      billingPausedAt: PAUSED_AT,
      userRoles: [],
    };
    const prisma: any = {
      user: { findFirst: jest.fn(async () => row), update: jest.fn() },
    };
    expect(await body(approveOrgUser(prisma, 'org-1', 'u-2'))).toMatchObject({
      code: 'plan_locked',
      lock: 'user_paused',
    });
    expect(
      await body(setOrgUserStatus(prisma, 'org-1', 'u-2', 'active')),
    ).toMatchObject({ code: 'plan_locked', lock: 'user_paused' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('every edit of something the plan locked returns plan_locked', () => {
  it('a view-only project (details, units, unit status)', async () => {
    const prisma: any = {
      project: { findFirst: async () => ({ billingViewOnlyAt: new Date() }) },
    };
    const guard = new ProjectEditableGuard(prisma);
    const ctx = (params: Record<string, string>) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ params, user: { orgId: 'org-1' } }),
        }),
      }) as never;
    const routes: Record<string, string>[] = [
      { id: 'p1' },
      { projectId: 'p1', id: 'unit-1' },
    ];
    for (const params of routes) {
      const err = await body(guard.canActivate(ctx(params)));
      expect(err).toMatchObject({
        statusCode: 403,
        code: 'plan_locked',
        lock: 'project_view_only',
      });
    }
    prisma.project.findFirst = async () => ({ billingViewOnlyAt: null });
    await expect(guard.canActivate(ctx({ id: 'p1' }))).resolves.toBe(true);
  });

  it('publishing an offline landing page', async () => {
    const prisma: any = {
      landingPage: {
        findFirst: async () => ({
          id: 'lp1',
          orgId: 'org-1',
          pageType: 'landing',
          status: 'unpublished',
          billingOfflineAt: new Date(),
          children: [{ id: 'ty' }],
        }),
        update: jest.fn(),
      },
    };
    const service = new OrgLandingPagesService(
      prisma,
      {} as never,
      {} as never,
    );
    expect(await body(service.publish('org-1', 'lp1'))).toMatchObject({
      code: 'plan_locked',
      lock: 'landing_page_offline',
    });
    expect(prisma.landingPage.update).not.toHaveBeenCalled();
  });
});
