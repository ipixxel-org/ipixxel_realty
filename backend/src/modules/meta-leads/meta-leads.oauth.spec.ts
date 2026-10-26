import { createHmac } from 'crypto';
import { MetaLeadsService } from './meta-leads.service';
import type { PrismaService } from '../../database/prisma.service';

describe('MetaLeadsService.handleOAuthCallback page discovery', () => {
  let service: MetaLeadsService;
  let prisma: {
    metaPageConnection: { upsert: jest.Mock };
    marketingPlatform: { upsert: jest.Mock };
    marketingConnection: { upsert: jest.Mock };
  };
  let fetchMock: jest.Mock;
  let warn: jest.SpyInstance;
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  function signedState(now = Date.now()): string {
    const body = {
      orgId: 'org-1',
      userId: 'user-1',
      platformKey: 'meta',
      ts: now,
    };
    const sig = createHmac('sha256', 'app-secret')
      .update(JSON.stringify(body))
      .digest('hex');
    return Buffer.from(JSON.stringify({ ...body, sig })).toString('base64url');
  }

  type Reply = { ok?: boolean; body: unknown };
  /** Graph responses for the calls that differ per test. */
  let graph: {
    accounts: Reply[];
    debugToken: Reply;
    pages: Record<string, Reply>;
  };

  function reply({ ok = true, body }: Reply) {
    return Promise.resolve({
      ok,
      status: ok ? 200 : 400,
      json: () => Promise.resolve(body),
    });
  }

  /** Graph paths requested, without the version prefix. */
  function calledPaths(): string[] {
    return fetchMock.mock.calls.map((call) =>
      new URL(String(call[0])).pathname.replace(/^\/v[\d.]+/, ''),
    );
  }

  function savedPageIds(): string[] {
    return prisma.metaPageConnection.upsert.mock.calls.map(
      (call) => call[0].create.pageId,
    );
  }

  function warnings(): string {
    return warn.mock.calls.map((call) => String(call[0])).join('\n');
  }

  beforeEach(() => {
    process.env.META_APP_ID = 'app-id';
    process.env.META_APP_SECRET = 'app-secret';
    graph = {
      accounts: [{ body: { data: [] } }],
      debugToken: { body: {} },
      pages: {},
    };

    let accountsCall = 0;
    fetchMock = jest.fn().mockImplementation((input: unknown) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/v[\d.]+/, '');
      if (path === '/oauth/access_token') {
        return reply({ body: { access_token: 'USER_TOKEN' } });
      }
      if (path === '/me/accounts') {
        return reply(graph.accounts[accountsCall++] ?? { body: { data: [] } });
      }
      if (path === '/debug_token') return reply(graph.debugToken);
      if (path.endsWith('/subscribed_apps')) {
        return reply({ body: { success: true } });
      }
      if (path.endsWith('/leadgen_forms')) return reply({ body: { data: [] } });
      const pageId = path.slice(1);
      return reply(
        graph.pages[pageId] ?? {
          ok: false,
          body: { error: { message: `Unknown object ${pageId}` } },
        },
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    prisma = {
      metaPageConnection: {
        upsert: jest.fn().mockImplementation(({ create }) =>
          Promise.resolve({
            id: `conn-${create.pageId}`,
            projectId: null,
            connectedAt: new Date(),
            updatedAt: new Date(),
            ...create,
          }),
        ),
      },
      marketingPlatform: { upsert: jest.fn().mockResolvedValue({}) },
      marketingConnection: { upsert: jest.fn().mockResolvedValue({}) },
    };
    service = new MetaLeadsService(prisma as unknown as PrismaService);
    warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('uses /me/accounts Pages (following paging) without the fallback', async () => {
    graph.accounts = [
      {
        body: {
          data: [{ id: 'p1', name: 'Page One', access_token: 'PT1' }],
          paging: {
            next: 'https://graph.facebook.com/v21.0/me/accounts?after=x',
          },
        },
      },
      { body: { data: [{ id: 'p2', name: 'Page Two', access_token: 'PT2' }] } },
    ];

    const result = await service.handleOAuthCallback('code', signedState());

    expect(result.connected).toBe(2);
    expect(savedPageIds()).toEqual(['p1', 'p2']);
    expect(calledPaths()).not.toContain('/debug_token');
  });

  it('falls back to granular-scope Page IDs when /me/accounts is empty', async () => {
    graph.debugToken = {
      body: {
        data: {
          granular_scopes: [
            { scope: 'pages_show_list', target_ids: ['p1'] },
            { scope: 'leads_retrieval', target_ids: ['p1', 'p2'] },
            { scope: 'ads_management', target_ids: ['act_9'] },
            { scope: 'pages_read_engagement' },
          ],
        },
      },
    };
    graph.pages = {
      p1: { body: { id: 'p1', name: 'Page One', access_token: 'PT1' } },
      p2: { body: { id: 'p2', name: 'Page Two', access_token: 'PT2' } },
    };

    const result = await service.handleOAuthCallback('code', signedState());

    expect(result.connected).toBe(2);
    expect(savedPageIds()).toEqual(['p1', 'p2']);
    expect(
      prisma.metaPageConnection.upsert.mock.calls[0][0].create,
    ).toMatchObject({
      orgId: 'org-1',
      pageName: 'Page One',
      accessToken: 'PT1',
    });
    expect(calledPaths()).not.toContain('/act_9');
    expect(calledPaths()).toEqual(
      expect.arrayContaining(['/p1/subscribed_apps', '/p2/subscribed_apps']),
    );

    const debugCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/debug_token'),
    );
    const debugUrl = new URL(String(debugCall?.[0]));
    expect(debugUrl.pathname).toBe('/v21.0/debug_token');
    expect(debugUrl.searchParams.get('input_token')).toBe('USER_TOKEN');
    expect(debugUrl.searchParams.get('access_token')).toBe(
      'app-id|app-secret',
    );
  });

  it('shows the clearer error when both sources return nothing', async () => {
    graph.debugToken = { body: { data: { granular_scopes: [] } } };

    await expect(service.handleOAuthCallback('code', signedState())).rejects.toThrow(
      'No Facebook Pages were shared with iPixxel. Click Connect again, choose Edit settings, and tick your Page (and its business portfolio if asked).',
    );
    expect(prisma.metaPageConnection.upsert).not.toHaveBeenCalled();
  });

  it('still connects the other Pages when one target ID fails', async () => {
    graph.debugToken = {
      body: {
        data: {
          granular_scopes: [
            { scope: 'pages_show_list', target_ids: ['bad', 'p2'] },
          ],
        },
      },
    };
    graph.pages = {
      bad: {
        ok: false,
        body: { error: { message: 'Unsupported get request' } },
      },
      p2: { body: { id: 'p2', name: 'Page Two', access_token: 'PT2' } },
    };

    const result = await service.handleOAuthCallback('code', signedState());

    expect(result.connected).toBe(1);
    expect(savedPageIds()).toEqual(['p2']);
    expect(warnings()).toContain('bad');
    expect(warnings()).toContain('Unsupported get request');
    expect(warnings()).not.toContain('USER_TOKEN');
    expect(warnings()).not.toContain('app-secret');
  });

  it('treats a failed debug_token call as no Pages without logging tokens', async () => {
    graph.debugToken = {
      ok: false,
      body: { error: { message: 'Invalid OAuth access token' } },
    };

    await expect(service.handleOAuthCallback('code', signedState())).rejects.toThrow(
      'No Facebook Pages were shared with iPixxel',
    );
    expect(warnings()).toContain('Invalid OAuth access token');
    expect(warnings()).not.toContain('USER_TOKEN');
    expect(warnings()).not.toContain('app-secret');
  });
});
