import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from './leads.service';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

function actor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return { sub: 'user-1', orgId: 'org-1', roles: ['admin'], ...overrides };
}

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: {
    lead: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    landingPage: { findUnique: jest.Mock; findFirst: jest.Mock };
    template: { findUnique: jest.Mock; findFirst: jest.Mock };
    project: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    projectSalesAgent: { findMany: jest.Mock; findFirst: jest.Mock };
    unit: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    roleModulePermission: { findMany: jest.Mock };
    userModulePermission: { findMany: jest.Mock };
    activityEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      lead: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      landingPage: { findUnique: jest.fn(), findFirst: jest.fn() },
      template: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
      project: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      projectSalesAgent: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      unit: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn(), findMany: jest.fn() },
      roleModulePermission: { findMany: jest.fn().mockResolvedValue([]) },
      userModulePermission: { findMany: jest.fn().mockResolvedValue([]) },
      activityEvent: { create: jest.fn().mockResolvedValue({}) },
      // Interactive transactions run the callback against the same mock.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  describe('list', () => {
    it('admin sees every lead in the org', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.list('org-1', actor());

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: 'org-1' },
        }),
      );
    });

    it('sales user only sees leads assigned to them', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.list('org-1', actor({ roles: ['sales'], sub: 'sales-9' }));

      // Sales users get an AND with OR: (assignedToId == actor OR projectId in [...])
      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([
            { orgId: 'org-1' },
            { OR: [{ assignedToId: 'sales-9' }] },
          ]),
        }),
      );
    });

    it('manager user only sees leads assigned to them', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.list('org-1', actor({ roles: ['manager'], sub: 'mgr-2' }));

      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([
            { orgId: 'org-1' },
            { OR: [{ assignedToId: 'mgr-2' }] },
          ]),
        }),
      );
    });

    it('sales user sees leads on projects they are assigned to', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);
      prisma.project.findMany.mockResolvedValue([]);
      prisma.projectSalesAgent.findMany.mockResolvedValue([{ projectId: 'proj-5' }]);

      await service.list('org-1', actor({ roles: ['sales'], sub: 'sales-9' }));

      expect(prisma.projectSalesAgent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'sales-9', project: { orgId: 'org-1' } },
        }),
      );

      const call = prisma.lead.findMany.mock.calls[0][0];
      const andClauses = call.where.AND;
      const orClause = andClauses.find((c: any) => Array.isArray(c.OR));
      // Project-agent visibility is scoped to leads with no individual
      // assignee — an explicit lead assignment overrides it.
      expect(orClause.OR).toEqual([
        { assignedToId: 'sales-9' },
        { assignedToId: null, projectId: { in: ['proj-5'] } },
      ]);
    });
  });

  describe('createFromPublic', () => {
    it('throws when landingPageId is missing', async () => {
      await expect(service.createFromPublic({ data: {} })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws when the landing page does not exist', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(null);
      prisma.landingPage.findFirst.mockResolvedValue(null);
      prisma.template.findUnique.mockResolvedValue(null);
      await expect(
        service.createFromPublic({ landingPageId: 'lp-x', data: {} }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a platform lead from a Super Admin published template', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(null);
      prisma.landingPage.findFirst.mockResolvedValue(null);
      prisma.template.findUnique.mockResolvedValue({
        id: 'tpl-lead',
        status: 'published',
      });
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({ id: 'lead-platform' });
      prisma.activityEvent.create.mockResolvedValue({});

      await service.createFromPublic({
        landingPageId: 'tpl-lead',
        formName: 'Lead gen',
        data: { name: 'Riya' },
      });

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'platform',
            landingPageId: 'tpl-lead',
            projectId: null,
          }),
        }),
      );
    });

    it('resolves a template preview id to a published page that used that template', async () => {
      prisma.landingPage.findUnique.mockResolvedValue(null);
      prisma.template.findUnique.mockResolvedValue(null);
      prisma.landingPage.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'lp-skyline',
          orgId: 'org-42',
          status: 'published',
        });
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({ id: 'lead-tpl' });
      prisma.activityEvent.create.mockResolvedValue({});

      await service.createFromPublic({
        landingPageId: 'tpl-builder',
        formName: 'Site visit enquiry',
        data: { name: 'Aarav' },
      });

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-42',
            landingPageId: 'lp-skyline',
          }),
        }),
      );
    });

    it('resolves org from the landing page and creates the lead', async () => {
      prisma.landingPage.findUnique.mockResolvedValue({
        id: 'lp-x',
        orgId: 'org-42',
        status: 'published',
      });
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({ id: 'lead-1' });

      const result = await service.createFromPublic({
        landingPageId: 'lp-x',
        formName: 'enquiry',
        source: 'website',
        data: { name: 'Aarav' },
      });

      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-42',
          landingPageId: 'lp-x',
          projectId: null,
          formName: 'enquiry',
          source: 'website',
          data: { fullName: 'Aarav' },
          configurations: [],
          tags: [],
        }),
      });
      expect(result.id).toBe('lead-1');
    });

    it('resolves org from a projectId when no landingPageId', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        orgId: 'org-42',
        status: 'active',
      });
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({ id: 'lead-2' });

      const result = await service.createFromPublic({
        projectId: 'proj-1',
        formName: 'enquiry',
        source: 'website',
        data: { name: 'Test' },
      });

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-42',
            projectId: 'proj-1',
          }),
        }),
      );
      expect(result.id).toBe('lead-2');
    });

    it('stores one canonical value per submitted contact field', async () => {
      prisma.landingPage.findUnique.mockResolvedValue({
        id: 'lp-x',
        orgId: 'org-42',
        status: 'published',
      });
      prisma.lead.findFirst.mockResolvedValue(null);
      prisma.lead.create.mockResolvedValue({ id: 'lead-3' });

      await service.createFromPublic({
        landingPageId: 'lp-x',
        data: {
          name: 'Shubham',
          'Full name': 'Shubham',
          email: 'shubham@example.com',
          'Email address': 'shubham@example.com',
          phone: '918854545645',
          phoneNumber: '918854545645',
          'Phone number': '918854545645',
          interestedIn: '3 BHK',
          'Interested in': '3 BHK',
          Notes: 'Needs evening callback',
        },
      });

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: {
              fullName: 'Shubham',
              email: 'shubham@example.com',
              phone: '918854545645',
              interestedIn: '3 BHK',
              Notes: 'Needs evening callback',
            },
          }),
        }),
      );
      const persisted = (prisma.lead.create as jest.Mock).mock.calls.at(-1)[0].data;
      expect(persisted.name).toBeUndefined();
      expect(persisted['Full name']).toBeUndefined();
      expect(persisted.phoneNumber).toBeUndefined();
      expect(persisted['Phone number']).toBeUndefined();
      expect(persisted['Interested in']).toBeUndefined();
    });
  });

  describe('importFromCsv', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      name: 'Asha Rao',
      phone: '+91 98250 41200',
      email: 'asha@example.com',
      ...overrides,
    });

    beforeEach(() => {
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' });
      prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1' });
      prisma.lead.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: `lead-${prisma.lead.create.mock.calls.length}`,
            ...data,
          }),
      );
    });

    it('adds only complete rows and reports the partial ones', async () => {
      const res = await service.importFromCsv('org-1', actor(), {
        projectId: 'proj-1',
        rows: [
          row({ rowNumber: 2 }),
          row({ rowNumber: 3, email: '' }),
          row({ rowNumber: 4, name: 'Vikram' }),
          row({ rowNumber: 5, name: '  ', phone: '' }),
          row({ rowNumber: 6, name: 'Meera' }),
        ],
      });

      expect(res).toEqual({
        total: 5,
        created: 3,
        failed: 2,
        errors: [
          { row: 3, reason: 'Missing Email' },
          { row: 5, reason: 'Missing Name, Phone' },
        ],
      });
      expect(prisma.lead.create).toHaveBeenCalledTimes(3);
      expect(prisma.activityEvent.create).toHaveBeenCalledTimes(3);
    });

    it('binds every row to the project picked for the file', async () => {
      await service.importFromCsv('org-1', actor(), {
        projectId: 'proj-1',
        rows: [row()],
      });

      expect(prisma.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'proj-1', orgId: 'org-1' } }),
      );
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            projectId: 'proj-1',
            formName: 'CSV import',
            source: 'crm',
            data: expect.objectContaining({
              fullName: 'Asha Rao',
              phone: '+91 98250 41200',
              email: 'asha@example.com',
            }),
          }),
        }),
      );
    });

    it('binds rows to a standalone unit, unassigned and with no project', async () => {
      await service.importFromCsv('org-1', actor(), {
        unitId: 'unit-1',
        rows: [row()],
      });

      expect(prisma.unit.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unit-1', orgId: 'org-1', projectId: null },
        }),
      );
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: null,
            assignedToId: null,
            data: expect.objectContaining({ unitId: 'unit-1' }),
          }),
        }),
      );
    });

    it('requires exactly one of project or standalone unit', async () => {
      await expect(
        service.importFromCsv('org-1', actor(), { rows: [row()] }),
      ).rejects.toThrow('Select a project or a standalone unit');
      await expect(
        service.importFromCsv('org-1', actor(), {
          projectId: 'proj-1',
          unitId: 'unit-1',
          rows: [row()],
        }),
      ).rejects.toThrow('Select a project or a standalone unit');
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('rejects a project or unit outside the org (or a project-bound unit)', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      prisma.unit.findFirst.mockResolvedValue(null);

      await expect(
        service.importFromCsv('org-1', actor(), {
          projectId: 'proj-x',
          rows: [row()],
        }),
      ).rejects.toThrow('Project not found');
      await expect(
        service.importFromCsv('org-1', actor(), {
          unitId: 'unit-x',
          rows: [row()],
        }),
      ).rejects.toThrow('Standalone unit not found');
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('skips rows with a bad email or bad phone', async () => {
      const res = await service.importFromCsv('org-1', actor(), {
        projectId: 'proj-1',
        rows: [row({ email: 'not-an-email' }), row({ phone: '12ab' })],
      });

      expect(res.created).toBe(0);
      expect(res.errors).toEqual([
        { row: 2, reason: 'Invalid email address' },
        { row: 3, reason: 'Invalid phone number (7–15 digits)' },
      ]);
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('reports a row as failed when saving it throws, and keeps going', async () => {
      prisma.lead.create
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({ id: 'lead-2' });

      const res = await service.importFromCsv('org-1', actor(), {
        projectId: 'proj-1',
        rows: [row({ rowNumber: 2 }), row({ rowNumber: 3 })],
      });

      expect(res.created).toBe(1);
      expect(res.errors).toEqual([
        { row: 2, reason: 'Could not be saved — please try again' },
      ]);
    });
  });

  describe('getById — by-id visibility gate', () => {
    const leadRow = {
      id: 'lead-9',
      orgId: 'org-1',
      status: 'new',
      assignedToId: 'other-agent',
      projectId: 'proj-5',
      landingPageId: null,
      data: {},
      activities: [],
      callLogs: [],
      nextActionType: null,
    };

    it('404s a lead the caller cannot see, even when fetched directly by id', async () => {
      prisma.lead.findFirst.mockResolvedValue(leadRow);
      prisma.project.findMany.mockResolvedValue([]);
      prisma.projectSalesAgent.findMany.mockResolvedValue([
        { projectId: 'proj-5', user: { firstName: 'Sam', lastName: 'Lee', email: 's@x.com' }, project: { name: 'P5', marketing: null } },
      ]);
      // The scope query finds nothing — the lead is assigned to someone else,
      // so the project-agent clause ({ assignedToId: null, projectId }) misses.
      prisma.lead.count.mockResolvedValue(0);

      await expect(
        service.getById('org-1', 'lead-9', actor({ roles: ['sales'], sub: 'sales-9' })),
      ).rejects.toThrow(NotFoundException);

      // The gate ran the same scope clauses as list(), as a real query.
      expect(prisma.lead.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'lead-9', orgId: 'org-1' }),
        }),
      );
    });

    it('returns the lead when the scope query matches', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...leadRow, assignedToId: null });
      prisma.project.findMany.mockResolvedValue([]);
      prisma.projectSalesAgent.findMany.mockResolvedValue([
        { projectId: 'proj-5', user: { firstName: 'Sam', lastName: 'Lee', email: 's@x.com' }, project: { name: 'P5', marketing: null } },
      ]);
      prisma.lead.count.mockResolvedValue(1);

      const result = await service.getById(
        'org-1',
        'lead-9',
        actor({ roles: ['sales'], sub: 'sales-9' }),
      );
      expect(result.id).toBe('lead-9');
    });
  });

  describe('assign', () => {
    const foundLead = {
      id: 'lead-1',
      orgId: 'org-1',
      status: 'new',
      assignedToId: null,
    };

    it('throws when the lead is not in the org', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.assign('org-1', 'lead-1', { assignedToId: null }, actor()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when the assignee is not in the same org (isolation)', async () => {
      prisma.lead.findFirst.mockResolvedValue(foundLead);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.assign('org-1', 'lead-1', { assignedToId: 'other-org-user' }, actor()),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'other-org-user', orgId: 'org-1' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          billingPausedAt: true,
        },
      });
    });

    it('assigns a lead to an in-org user and sets status', async () => {
      prisma.lead.findFirst.mockResolvedValue(foundLead);
      prisma.user.findFirst.mockResolvedValue({ id: 'sales-9' });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        status: 'follow_up',
        assignedTo: {
          id: 'sales-9',
          firstName: 'Rohit',
          lastName: 'Menon',
          email: 'r@x.com',
        },
      });
      prisma.activityEvent.create.mockResolvedValue({
        id: 'act-1',
        type: 'status_updated',
        text: 'Assigned to Rohit Menon · Status changed from new to follow up — Called, interested',
        createdAt: new Date(),
      });

      const result = await service.assign('org-1', 'lead-1', {
        assignedToId: 'sales-9',
        status: 'follow_up',
        note: 'Called, interested',
      }, actor());

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { assignedToId: 'sales-9', status: 'follow_up' },
        include: expect.anything() as never,
      });
      expect(prisma.activityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'status_updated',
            text: expect.stringContaining('Called, interested'),
          }),
        }),
      );
      expect(result.assignedTo?.name).toBe('Rohit Menon');
    });

    it('rejects a pipeline status change without a note', async () => {
      prisma.lead.findFirst.mockResolvedValue(foundLead);
      prisma.user.findFirst.mockResolvedValue({ id: 'sales-9' });

      await expect(
        service.assign('org-1', 'lead-1', {
          assignedToId: 'sales-9',
          status: 'follow_up',
        }, actor()),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it('unassigns a lead when assignedToId is null', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        ...foundLead,
        assignedToId: 'sales-9',
      });
      prisma.lead.update.mockResolvedValue({
        id: 'lead-1',
        status: 'new',
        assignedTo: null,
      });

      const result = await service.assign('org-1', 'lead-1', {
        assignedToId: null,
      }, actor());

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { assignedToId: null },
        include: expect.anything() as never,
      });
      expect(result.assignedTo).toBeNull();
    });
  });

  describe('listAssignableUsers', () => {
    it('returns members whose role grants CRM view, excluding admins/managers', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'sales-9',
          firstName: 'Rohit',
          lastName: 'Menon',
          email: 'r@x.com',
          userRoles: [{ role: { key: 'sales', name: 'Sales', status: 'active' } }],
        },
        {
          id: 'mgr-2',
          firstName: 'Meera',
          lastName: 'Rao',
          email: 'm@x.com',
          // Multi-role: also a manager — must be excluded even though `sales`
          // would otherwise qualify (the picker/API mismatch bug).
          userRoles: [
            { role: { key: 'manager', name: 'Manager', status: 'active' } },
            { role: { key: 'sales', name: 'Sales', status: 'active' } },
          ],
        },
      ]);

      const { data } = await service.listAssignableUsers('org-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // Paused users (billing v2) aren't offered.
          where: { orgId: 'org-1', status: 'active', billingPausedAt: null },
        }),
      );
      expect(data.map((u) => u.id)).toEqual(['sales-9']);
      expect(data[0].name).toBe('Rohit Menon');
    });
  });
});
