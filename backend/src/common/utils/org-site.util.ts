import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { generateUniqueLandingPageSlug } from './slug.util';

type Tx = Prisma.TransactionClient;
type SubdomainLookup = PrismaService | Prisma.TransactionClient;

export async function generateUniqueSubdomain(
  _prisma: SubdomainLookup,
  _source: string,
  _excludeOrgId?: string,
): Promise<string> {
  return '';
}

/** Ensures a published landing page from assigned templates. */
export async function provisionOrgPortal(
  tx: Tx,
  org: {
    id: string;
    name: string;
    slug: string;
    subdomain?: string | null;
    customDomain?: string | null;
    customDomainLandingPageId?: string | null;
  },
  _actorId: string,
  preferredTemplateId?: string | null,
): Promise<{ subdomain: string; host: string; landingPageId: string | null }> {
  const existingPrimary = await tx.landingPage.findFirst({
    where: { orgId: org.id, status: 'published' },
    select: { id: true },
  });

  let landingPageId = existingPrimary?.id ?? null;
  if (!existingPrimary) {
    let templateId = preferredTemplateId ?? null;
    if (!templateId) {
      const assigned = await tx.organisationTemplate.findFirst({
        where: {
          orgId: org.id,
          billingPausedAt: null,
          template: { status: 'published', pageType: 'landing' },
        },
        orderBy: { assignedAt: 'asc' },
        select: { templateId: true },
      });
      templateId = assigned?.templateId ?? null;
    }
    if (templateId) {
      const tpl = await tx.template.findFirst({
        where: { id: templateId, status: 'published', pageType: 'landing' },
        include: { childPages: { where: { pageType: 'thank_you' }, take: 1 } },
      });
      if (tpl) {
        const baseSlug = await generateUniqueLandingPageSlug(tx, org.id, tpl.name);
        const primary = await tx.landingPage.create({
          data: {
            orgId: org.id,
            sourceTemplateId: tpl.id,
            name: tpl.name,
            slug: baseSlug,
            pageType: 'landing',
            status: 'published',
            publishedAt: new Date(),
            content: (tpl.content as Prisma.JsonObject) ?? {},
          },
        });
        landingPageId = primary.id;
        if (tpl.childPages?.[0]) {
          await tx.landingPage.create({
            data: {
              orgId: org.id,
              sourceTemplateId: tpl.childPages[0].id,
              name: tpl.childPages[0].name,
              slug: `${baseSlug}-thank-you`,
              pageType: 'thank_you',
              status: 'published',
              publishedAt: new Date(),
              parentId: primary.id,
              content: (tpl.childPages[0].content as Prisma.JsonObject) ?? {},
            },
          });
        }
      }
    }
  }

  if (
    org.customDomainLandingPageId == null &&
    org.customDomain &&
    landingPageId
  ) {
    await tx.organisation.update({
      where: { id: org.id },
      data: { customDomainLandingPageId: landingPageId },
    });
  }

  return { subdomain: '', host: org.customDomain || '', landingPageId };
}
