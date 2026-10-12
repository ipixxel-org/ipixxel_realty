import type { OrgIndustry, PrismaClient } from '@prisma/client';
import { buildOrganisationUpdateData } from './mappers.util';
import type { UpdateOrganisationDto } from '../../modules/admin-organisations/dto/update-organisation.dto';

// Organisation.industry ("What describes you best?" at signup) can be changed
// later by the Org Admin (Settings → General) or a Super Admin (Organisations
// → Edit). Every change is recorded as an audit log row so both screens can
// show who changed it, from what, to what.
export const ORG_INDUSTRY_CHANGED_ACTION = 'org_industry_changed';

export type IndustryChangedBy = 'org_admin' | 'super_admin';

// Shared by the Org Admin and Super Admin organisation-update paths. Same
// update as before (buildOrganisationUpdateData), plus — only when the
// industry actually changes — an audit row written in the same transaction.
export async function updateOrganisationProfile(
  prisma: PrismaClient,
  orgId: string,
  dto: UpdateOrganisationDto,
  actorId: string,
  changedBy: IndustryChangedBy,
) {
  return prisma.$transaction(async (tx) => {
    const before =
      dto.industry !== undefined
        ? await tx.organisation.findUniqueOrThrow({
            where: { id: orgId },
            select: { industry: true },
          })
        : null;

    const updated = await tx.organisation.update({
      where: { id: orgId },
      data: buildOrganisationUpdateData(dto),
    });

    if (before && before.industry !== updated.industry) {
      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          action: ORG_INDUSTRY_CHANGED_ACTION,
          entity: 'Organisation',
          entityId: orgId,
          metadata: {
            from: before.industry,
            to: updated.industry,
            changedBy,
          },
        },
      });
    }

    return updated;
  });
}

export interface IndustryHistoryEntry {
  id: string;
  from: OrgIndustry | null;
  to: OrgIndustry | null;
  changedBy: IndustryChangedBy | null;
  changedAt: Date;
  actor: { name: string | null; email: string } | null;
}

// Most recent first, capped — this is a short history panel, not an export.
export async function listIndustryHistory(
  prisma: PrismaClient,
  orgId: string,
  limit = 50,
): Promise<IndustryHistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { orgId, action: ORG_INDUSTRY_CHANGED_ACTION },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  return rows.map((row) => {
    const meta = (row.metadata ?? {}) as {
      from?: OrgIndustry | null;
      to?: OrgIndustry | null;
      changedBy?: IndustryChangedBy;
    };
    const name = row.actor
      ? [row.actor.firstName, row.actor.lastName].filter(Boolean).join(' ') ||
        null
      : null;
    return {
      id: row.id,
      from: meta.from ?? null,
      to: meta.to ?? null,
      changedBy: meta.changedBy ?? null,
      changedAt: row.createdAt,
      actor: row.actor ? { name, email: row.actor.email } : null,
    };
  });
}
