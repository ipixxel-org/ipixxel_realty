import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

// NOTE: this is a hard-coded role-key check. A custom role that an org grants
// org-wide lead access to will NOT be recognised here — it only matches the
// built-in `super_admin` / `admin` keys. If that ever needs to work, this has
// to resolve effective `crm` permissions (see computeEffectivePermissions in
// permissions.util.ts) instead of matching keys.
export function canSeeAllLeads(roles: string[] | undefined): boolean {
  const keys = roles ?? [];
  return (
    keys.includes('super_admin') ||
    keys.includes('admin') ||
    keys.includes('organisation_admin') ||
    keys.includes('org_admin') ||
    keys.includes('owner')
  );
}

function landingPageIdOf(
  marketing: Prisma.JsonValue | null | undefined,
): string | null {
  const id = (marketing as Record<string, unknown> | null | undefined)
    ?.landingPageId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * The OR clauses that define which leads a non-admin user may see.
 *
 * Two tiers of project-derived visibility:
 *   - Projects the user MANAGES (`project.managerId`)  → every lead on the
 *     project, assigned or not.
 *   - Projects the user is a SALES AGENT on (`project_sales_agents`) → only
 *     leads with NO individual assignee. An explicit `assignedToId` on a lead
 *     overrides project-level visibility, so once a lead is assigned to someone
 *     else the project's other agents no longer see it.
 *
 * Plus the user's own directly-assigned leads, always.
 *
 * Nothing is materialised onto `Lead.assignedToId` — adding or removing a
 * project agent takes effect immediately across that project's unassigned
 * leads because visibility is resolved here at query time.
 */
export async function actorLeadOrClauses(
  prisma: Pick<PrismaService, 'project' | 'projectSalesAgent'>,
  orgId: string,
  actorId: string,
): Promise<Prisma.LeadWhereInput[]> {
  const [managed, salesLinks] = await Promise.all([
    prisma.project.findMany({
      where: { orgId, managerId: actorId },
      select: { id: true, name: true, marketing: true },
    }),
    prisma.projectSalesAgent.findMany({
      where: { userId: actorId, project: { orgId } },
      select: {
        projectId: true,
        project: { select: { name: true, marketing: true } },
      },
    }),
  ]);

  const managedProjectIds = managed.map((p) => p.id);
  const managedLandingPageIds = managed
    .map((p) => landingPageIdOf(p.marketing))
    .filter((id): id is string => id !== null);
  const managedProjectNames = managed
    .map((p) => p.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  const salesProjectIds = salesLinks.map((l) => l.projectId);
  const salesLandingPageIds = salesLinks
    .map((l) => landingPageIdOf(l.project?.marketing))
    .filter((id): id is string => id !== null);
  const salesProjectNames = salesLinks
    .map((l) => l.project?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  const orClauses: Prisma.LeadWhereInput[] = [
    { assignedToId: actorId },
  ];

  // Managed projects — everything.
  if (managedProjectIds.length > 0) {
    orClauses.push({ projectId: { in: managedProjectIds } });
  }
  if (managedLandingPageIds.length > 0) {
    orClauses.push({ landingPageId: { in: managedLandingPageIds } });
  }
  for (const name of managedProjectNames) {
    orClauses.push({ data: { path: ['project'], equals: name } });
  }

  // Sales-agent projects — only leads with no individual assignee.
  if (salesProjectIds.length > 0) {
    orClauses.push({ assignedToId: null, projectId: { in: salesProjectIds } });
  }
  if (salesLandingPageIds.length > 0) {
    orClauses.push({
      assignedToId: null,
      landingPageId: { in: salesLandingPageIds },
    });
  }
  for (const name of salesProjectNames) {
    orClauses.push({
      assignedToId: null,
      data: { path: ['project'], equals: name },
    });
  }

  return orClauses;
}
