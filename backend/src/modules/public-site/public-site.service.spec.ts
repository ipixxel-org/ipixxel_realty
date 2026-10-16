import { NotFoundException } from '@nestjs/common';
import { PublicSiteService } from './public-site.service';

type Row = {
  id: string;
  orgId: string;
  slug: string;
  status: 'published' | 'draft';
  pageType: 'landing' | 'thank_you';
  publishedAt: Date | null;
  updatedAt: Date;
  organisation: { slug: string };
};

// Three organisations published a page from the same template, so they share
// the slug "aurelia-reserve" — the staging situation this guards against.
const rows: Row[] = [
  {
    id: 'p-acme',
    orgId: 'org-acme',
    slug: 'aurelia-reserve',
    status: 'published',
    pageType: 'landing',
    publishedAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    organisation: { slug: 'acme' },
  },
  {
    id: 'p-zen',
    orgId: 'org-zen',
    slug: 'aurelia-reserve',
    status: 'published',
    pageType: 'landing',
    publishedAt: new Date('2026-10-10'),
    updatedAt: new Date('2026-10-10'),
    organisation: { slug: 'zen-homes' },
  },
  {
    id: 'p-old',
    orgId: 'org-old',
    slug: 'aurelia-reserve',
    status: 'draft',
    pageType: 'landing',
    publishedAt: null,
    updatedAt: new Date('2026-10-12'),
    organisation: { slug: 'old-co' },
  },
];

/** Applies the subset of Prisma `where` / `orderBy` the service uses. */
function matches(row: Row, where: any): boolean {
  if (where.status && row.status !== where.status) return false;
  const org = where.organisation?.slug?.equals;
  if (org && row.organisation.slug.toLowerCase() !== String(org).toLowerCase())
    return false;
  if (Array.isArray(where.OR)) {
    return where.OR.some((clause: any) => {
      const eq = clause.slug?.equals;
      return (
        eq !== undefined && row.slug.toLowerCase() === String(eq).toLowerCase()
      );
    });
  }
  return true;
}

function sortRows(list: Row[], orderBy: any[] = []): Row[] {
  const out = [...list];
  out.sort((a, b) => {
    for (const ord of orderBy) {
      const [field, spec] = Object.entries(ord)[0] as [keyof Row, any];
      const dir = typeof spec === 'string' ? spec : spec.sort;
      const av = a[field] as Date | null;
      const bv = b[field] as Date | null;
      if (av === bv) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      const diff = av.getTime() - bv.getTime();
      if (diff !== 0) return dir === 'desc' ? -diff : diff;
    }
    return 0;
  });
  return out;
}

function makeService() {
  const prisma: any = {
    landingPage: {
      findFirst: jest.fn(
        async ({ where, orderBy }: any) =>
          sortRows(
            rows.filter((r) => matches(r, where)),
            orderBy,
          )[0] ?? null,
      ),
      findUnique: jest.fn(
        async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
      ),
    },
    trackingEvent: { create: jest.fn(() => Promise.resolve({})) },
  };
  return { service: new PublicSiteService(prisma), prisma };
}

describe('PublicSiteService slug resolution', () => {
  it('resolves a shared slug to the page of the requested organisation', async () => {
    const { service } = makeService();

    await expect(
      service.resolveBySlugInOrg('acme', 'aurelia-reserve', false),
    ).resolves.toMatchObject({
      id: 'p-acme',
    });
    await expect(
      service.resolveBySlugInOrg('ZEN-HOMES', 'aurelia-reserve', false),
    ).resolves.toMatchObject({ id: 'p-zen' });
  });

  it('scopes the database query to the organisation slug', async () => {
    const { service, prisma } = makeService();

    await service.resolveBySlugInOrg('acme', 'aurelia-reserve', false);

    const { where } = prisma.landingPage.findFirst.mock.calls[0][0];
    expect(where.organisation).toEqual({
      slug: { equals: 'acme', mode: 'insensitive' },
    });
    expect(where.status).toBe('published');
  });

  it('never falls back to another organisation', async () => {
    const { service } = makeService();

    await expect(
      service.resolveBySlugInOrg('nobody', 'aurelia-reserve', false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('legacy slug-only lookup is deterministic: most recently published wins', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.resolveBySlug('aurelia-reserve', false),
    ).resolves.toMatchObject({
      id: 'p-zen',
    });
    expect(prisma.landingPage.findFirst.mock.calls[0][0].orderBy).toEqual([
      { publishedAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
    ]);
  });

  it('only tracks a view when asked to', async () => {
    const { service, prisma } = makeService();

    await service.resolveBySlugInOrg('acme', 'aurelia-reserve', false);
    expect(prisma.trackingEvent.create).not.toHaveBeenCalled();
    await service.resolveBySlugInOrg('acme', 'aurelia-reserve', true);
    expect(prisma.trackingEvent.create).toHaveBeenCalledTimes(1);
  });
});

describe('PublicSiteService.publicPathForPage', () => {
  it('returns the org slug and page slug without content', async () => {
    const { service } = makeService();

    await expect(service.publicPathForPage('p-zen')).resolves.toEqual({
      orgSlug: 'zen-homes',
      slug: 'aurelia-reserve',
      status: 'published',
      pageType: 'landing',
    });
  });

  it('404s for an unknown page', async () => {
    const { service } = makeService();

    await expect(service.publicPathForPage('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
