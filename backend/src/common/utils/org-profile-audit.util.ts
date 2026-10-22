import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  ORGANISATION_EDITABLE_FIELDS,
  buildOrganisationUpdateData,
} from './mappers.util';
import type { UpdateOrganisationDto } from '../../modules/admin-organisations/dto/update-organisation.dto';
import { orgTaxDetailsProblem } from '../../modules/billing/org-billing-details';
import { normaliseGstin } from '../../modules/billing/gst';

// Organisation profile ("General" details) can be edited by the Org Admin
// (Settings → General) or a Super Admin (Organisations → Edit). Every save
// that actually changes something writes one audit row listing each changed
// field (from → to), so both screens can show who changed what, and when.
export const ORG_PROFILE_UPDATED_ACTION = 'org_profile_updated';

// Earlier rows recorded only industry changes under their own action — still
// read back so that history isn't lost.
export const ORG_INDUSTRY_CHANGED_ACTION = 'org_industry_changed';

export type ProfileChangedBy = 'org_admin' | 'super_admin';

// Fields not shown in either profile form, so not meaningful in the audit:
// brandColour is hidden but still sent on save (Settings fills in a default
// when none is stored), which would otherwise log a phantom "change".
const NOT_AUDITED: ReadonlySet<string> = new Set(['brandColour']);

const AUDITED_FIELDS = [
  ...ORGANISATION_EDITABLE_FIELDS.filter((f) => !NOT_AUDITED.has(f)),
  'industry',
] as const;
type AuditedField = (typeof ORGANISATION_EDITABLE_FIELDS)[number] | 'industry';

// A type alias (not an interface) so it is assignable to Prisma's JSON input.
export type ProfileFieldChange = {
  field: AuditedField;
  from: string | null;
  to: string | null;
};

// null / undefined / "" all mean "not set" — treat them as equal so saving
// an untouched blank field doesn't log a phantom change.
function norm(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value;
}

// Shared by the Org Admin and Super Admin organisation-update paths. Same
// update as before (buildOrganisationUpdateData), plus — only when at least
// one field actually changes — an audit row written in the same transaction.
export async function updateOrganisationProfile(
  prisma: PrismaClient,
  orgId: string,
  dto: UpdateOrganisationDto,
  actorId: string,
  changedBy: ProfileChangedBy,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.organisation.findUniqueOrThrow({
      where: { id: orgId },
    });

    // The profile is the billing source of truth: state is a GST state code
    // and the GSTIN (optional) must be valid and registered in that state.
    const data = buildOrganisationUpdateData(dto);
    if (dto.gstin !== undefined) data.gstin = normaliseGstin(dto.gstin) || null;
    if (dto.state !== undefined) data.state = dto.state.trim() || null;
    if (dto.state !== undefined || dto.gstin !== undefined) {
      const problem = orgTaxDetailsProblem(
        dto.state !== undefined ? dto.state : before.state,
        dto.gstin !== undefined ? dto.gstin : before.gstin,
      );
      if (problem) throw new BadRequestException(problem);
    }

    const updated = await tx.organisation.update({
      where: { id: orgId },
      data,
    });

    const changes: ProfileFieldChange[] = [];
    for (const field of AUDITED_FIELDS) {
      if (dto[field] === undefined) continue; // not part of this save
      const from = norm(before[field]);
      const to = norm(updated[field]);
      if (from !== to) changes.push({ field, from, to });
    }

    if (changes.length > 0) {
      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          action: ORG_PROFILE_UPDATED_ACTION,
          entity: 'Organisation',
          entityId: orgId,
          metadata: { changes, changedBy },
        },
      });
    }

    return updated;
  });
}

export interface ProfileHistoryEntry {
  id: string;
  changes: ProfileFieldChange[];
  changedBy: ProfileChangedBy | null;
  changedAt: Date;
  actor: { name: string | null; email: string } | null;
}

// Most recent first, capped — this is a history panel, not an export.
export async function listProfileHistory(
  prisma: PrismaClient,
  orgId: string,
  limit = 100,
): Promise<ProfileHistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      orgId,
      action: { in: [ORG_PROFILE_UPDATED_ACTION, ORG_INDUSTRY_CHANGED_ACTION] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  const entries: ProfileHistoryEntry[] = [];
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as {
      changes?: ProfileFieldChange[];
      changedBy?: ProfileChangedBy;
      from?: string | null;
      to?: string | null;
    };
    const changes: ProfileFieldChange[] =
      row.action === ORG_INDUSTRY_CHANGED_ACTION
        ? [{ field: 'industry', from: meta.from ?? null, to: meta.to ?? null }]
        : Array.isArray(meta.changes)
          ? meta.changes.filter((c) => !NOT_AUDITED.has(c.field))
          : [];
    // Rows recorded before a field was excluded may now have nothing left.
    if (changes.length === 0) continue;
    const name = row.actor
      ? [row.actor.firstName, row.actor.lastName].filter(Boolean).join(' ') ||
        null
      : null;
    entries.push({
      id: row.id,
      changes,
      changedBy: meta.changedBy ?? null,
      changedAt: row.createdAt,
      actor: row.actor ? { name, email: row.actor.email } : null,
    });
  }
  return entries;
}
