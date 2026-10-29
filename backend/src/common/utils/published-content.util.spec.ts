import { OrgLandingPagesService } from '../../modules/org-landing-pages/org-landing-pages.service';
import * as lifecycle from './subscription-lifecycle.util';
import {
  hasUnpublishedChanges,
  liveContent,
  snapshotBeforeEdit,
  toOwnerView,
  withLiveContent,
} from './published-content.util';

const v1 = { sections: [{ id: 'hero', title: 'Old' }] };
const v2 = { sections: [{ id: 'hero', title: 'New' }] };

describe('published content helpers', () => {
  it('serves the snapshot, falling back to content for legacy pages', () => {
    expect(liveContent({ content: v2, publishedContent: v1 })).toBe(v1);
    expect(liveContent({ content: v2, publishedContent: null })).toBe(v2);
    const pub = withLiveContent({ id: 'p', content: v2, publishedContent: v1 });
    expect(pub).toEqual({ id: 'p', content: v1 });
  });

  it('flags unpublished edits only on live pages', () => {
    expect(hasUnpublishedChanges({ status: 'published', content: v2, publishedContent: v1 })).toBe(true);
    expect(hasUnpublishedChanges({ status: 'published', content: v1, publishedContent: { ...v1 } })).toBe(false);
    expect(hasUnpublishedChanges({ status: 'draft', content: v2, publishedContent: v1 })).toBe(false);
    expect(toOwnerView({ status: 'published', content: v2, publishedContent: v1 })).toEqual({
      status: 'published',
      content: v2,
      hasUnpublishedChanges: true,
    });
  });

  it('freezes the live version on the first edit of a legacy live page', () => {
    expect(snapshotBeforeEdit({ status: 'published', content: v1, publishedContent: null })).toEqual({ publishedContent: v1 });
    expect(snapshotBeforeEdit({ status: 'published', content: v1, publishedContent: v1 })).toEqual({});
    expect(snapshotBeforeEdit({ status: 'draft', content: v1, publishedContent: null })).toEqual({});
  });
});

describe('editing a published landing page', () => {
  function setup(row: Record<string, unknown>) {
    let stored: any = {
      id: 'lp',
      orgId: 'org-1',
      name: 'Page',
      slug: 'page',
      pageType: 'landing',
      billingOfflineAt: null,
      children: [{ id: 'ty', name: 'Thanks', slug: 'ty', status: 'published' }],
      parent: null,
      orgDomainRequests: [],
      ...row,
    };
    const prisma: any = {
      landingPage: {
        findFirst: jest.fn(async () => stored),
        findMany: jest.fn(async () => []),
        update: jest.fn(async ({ data }: any) => (stored = { ...stored, ...data })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new OrgLandingPagesService(prisma, {} as never, { captureLandingPage: jest.fn() } as never);
    return { service, get: () => stored };
  }

  it('keeps the page live and reports unpublished changes', async () => {
    const { service, get } = setup({ status: 'published', content: v1, publishedContent: v1 });
    const res = await service.update('org-1', 'lp', { content: v2 } as any);
    expect(get().status).toBe('published');
    expect(get().publishedContent).toEqual(v1);
    expect(res).toMatchObject({ status: 'published', hasUnpublishedChanges: true });
    expect(res).not.toHaveProperty('publishedContent');
  });

  it('publishing copies the edits to the live version', async () => {
    jest.spyOn(lifecycle, 'assertOrgCanPublish').mockResolvedValue(undefined);
    const { service, get } = setup({ status: 'published', content: v2, publishedContent: v1 });
    const res = await service.publish('org-1', 'lp');
    expect(get().publishedContent).toEqual(v2);
    expect(res).toMatchObject({ status: 'published', hasUnpublishedChanges: false });
  });
});
