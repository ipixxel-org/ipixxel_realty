import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { deepEqual } from '../../common/utils/deep-equal.util';

// Snapshots kept per page — one per content-changing save, pruned
// oldest-first whenever a new one lands, so a heavily edited page can never
// grow an unbounded history table.
const REVISION_LIMIT = 30;

// The content shape LandingPage.content (and the builder save body) carries.
// Restoring maps these four keys back verbatim, exactly like
// OrgLandingPagesService.update does for a regular content PATCH.
type StoredContent = {
  sections?: unknown;
  config?: unknown;
  engine?: string;
  site?: unknown;
};

@Injectable()
export class PageRevisionsService {
  private readonly logger = new Logger(PageRevisionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Record a snapshot of a landing page's content. Best-effort by design:
   * a failed history write must never fail the save that triggered it. */
  async captureLandingPage(
    orgId: string,
    landingPageId: string,
    content: Prisma.InputJsonValue,
    createdById?: string | null,
  ): Promise<void> {
    try {
      await this.prisma.pageRevision.create({
        data: {
          landingPageId,
          orgId,
          content,
          createdById: createdById ?? null,
        },
      });
      await this.pruneLandingPage(landingPageId);
    } catch (err) {
      this.logger.warn(
        `page_revisions capture failed for landing page ${landingPageId}: ${String(err)}`,
      );
    }
  }

  /** Metadata list — content is deliberately omitted here (a list of full
   * page JSONs is heavy); the panel fetches a single snapshot's content
   * only when the user opens/restores it. */
  async list(orgId: string, landingPageId: string) {
    await this.assertOwned(orgId, landingPageId);
    return this.prisma.pageRevision.findMany({
      where: { landingPageId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true, label: true },
    });
  }

  async get(orgId: string, landingPageId: string, revisionId: string) {
    await this.assertOwned(orgId, landingPageId);
    const revision = await this.prisma.pageRevision.findFirst({
      where: { id: revisionId, landingPageId },
    });
    if (!revision) throw new NotFoundException('Revision not found');
    return revision;
  }

  /** Server-side restore: writes the snapshot's content back onto the page
   * with the same normalisation and published-to-draft revert rule as a
   * regular content save (OrgLandingPagesService.update), then captures the
   * restored state so the restore itself shows up in — and can be undone
   * from — the same history list. */
  async restore(orgId: string, landingPageId: string, revisionId: string) {
    const page = await this.assertOwned(orgId, landingPageId);
    const revision = await this.get(orgId, landingPageId, revisionId);

    const raw = (revision.content ?? {}) as StoredContent;
    const content: StoredContent = {
      sections: raw.sections,
      config: raw.config,
      engine: raw.engine,
      site: raw.site,
    };
    const contentChanged = !deepEqual(page.content, content);

    const updated = await this.prisma.landingPage.update({
      where: { id: landingPageId },
      data: {
        content: content as Prisma.InputJsonValue,
        ...(contentChanged && page.status === 'published'
          ? { status: 'draft' as const }
          : {}),
      },
    });

    if (contentChanged) {
      await this.captureLandingPage(
        orgId,
        landingPageId,
        content as Prisma.InputJsonValue,
      );
    }
    return updated;
  }

  /** Ownership check shared by every route — orgId always comes from the
   * JWT, never from the path, so one org can't touch another org's history. */
  private async assertOwned(orgId: string, landingPageId: string) {
    const page = await this.prisma.landingPage.findFirst({
      where: { id: landingPageId, orgId },
      select: { id: true, status: true, content: true },
    });
    if (!page) throw new NotFoundException('Landing page not found');
    return page;
  }

  private async pruneLandingPage(landingPageId: string) {
    const stale = await this.prisma.pageRevision.findMany({
      where: { landingPageId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: REVISION_LIMIT,
      select: { id: true },
    });
    if (stale.length) {
      await this.prisma.pageRevision.deleteMany({
        where: { id: { in: stale.map((r) => r.id) } },
      });
    }
  }
}
