import { GoogleSheetsService } from './google-sheets.service';
import { PrismaService } from '../../database/prisma.service';

describe('GoogleSheetsService sheet-to-CRM updates', () => {
  const existingLead = {
    id: 'lead-1',
    orgId: 'org-1',
    projectId: null,
    status: 'contacted',
    campaign: 'Existing campaign',
    data: {
      name: 'Previous name',
      fullName: 'Previous name',
      phone: '555-0100',
      email: 'person@example.com',
      notes: 'Existing notes',
      customField: 'keep this',
    },
  };

  function setup() {
    const connection = {
      id: 'connection-1',
      orgId: 'org-1',
      platformKey: 'google_sheets',
      status: 'connected',
      externalAccountId: 'gsheet:test@example.com',
      externalAccountName: 'Test sheet',
      accessToken: null,
      refreshToken: null,
      projectId: null,
      metadata: { webhookSecret: 'webhook-secret' },
      lastSyncAt: null,
      connectedAt: new Date(),
    };
    const captured: {
      updateArgs?: {
        where: { id: string };
        data: Record<string, unknown>;
      };
    } = {};
    const leadUpdate = jest.fn(
      (args: { where: { id: string }; data: Record<string, unknown> }) => {
        captured.updateArgs = args;
        return Promise.resolve({ ...existingLead, id: existingLead.id });
      },
    );
    const prisma = {
      marketingConnection: {
        findUnique: jest.fn().mockResolvedValue(connection),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      lead: {
        findFirst: jest.fn().mockResolvedValue(existingLead),
        update: leadUpdate,
        create: jest.fn(),
      },
      project: { findFirst: jest.fn() },
    } as unknown as PrismaService;

    return { service: new GoogleSheetsService(prisma), captured, leadUpdate };
  }

  function storedLeadData(
    updateArgs:
      | {
          data: Record<string, unknown>;
        }
      | undefined,
  ): Record<string, unknown> {
    const value = updateArgs?.data.data;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Expected the webhook to update lead data');
    }
    return value as Record<string, unknown>;
  }

  it('applies a changed sheet cell, including clearing it, without resetting unrelated fields', async () => {
    const { service, captured, leadUpdate } = setup();

    await service.handleWebhook({
      token: 'webhook-secret',
      connectionId: 'connection-1',
      action: 'edit',
      spreadsheetId: 'sheet-1',
      sheetName: 'Leads',
      rowNumber: 2,
      changedColumns: [2],
      lead: {
        id: 'lead-1',
        name: '',
        phone: '555-0100',
        email: 'person@example.com',
        status: 'New',
        notes: '',
        campaign: '',
      },
    });

    expect(leadUpdate).toHaveBeenCalledTimes(1);
    expect(captured.updateArgs?.where.id).toBe('lead-1');
    const updateData = captured.updateArgs?.data;
    const leadData = storedLeadData(captured.updateArgs);
    expect(leadData.name).toBe('');
    expect(leadData.fullName).toBe('');
    expect(leadData.phone).toBe('555-0100');
    expect(leadData.notes).toBe('Existing notes');
    expect(leadData.customField).toBe('keep this');
    expect(updateData).not.toHaveProperty('status');
    expect(updateData).not.toHaveProperty('campaign');
  });

  it('clears notes when the notes cell is cleared', async () => {
    const { service, captured, leadUpdate } = setup();

    await service.handleWebhook({
      token: 'webhook-secret',
      connectionId: 'connection-1',
      action: 'edit',
      rowNumber: 2,
      changedColumns: [10],
      lead: { id: 'lead-1', notes: '' },
    });

    expect(leadUpdate).toHaveBeenCalledTimes(1);
    expect(storedLeadData(captured.updateArgs).notes).toBe('');
  });

  it('generates an Apps Script that reports the edited columns and every row in a pasted range', () => {
    const { service } = setup();

    const script = service.generateAppsScriptCode({
      webhookUrl: 'https://example.test/webhooks/google-sheets',
      webhookToken: 'secret',
      connectionId: 'connection-1',
    });

    expect(script).toContain('changedColumns: changedColumns || null');
    expect(script).toContain('range.getNumRows()');
    expect(script).toContain('range.getNumColumns()');
  });
});
