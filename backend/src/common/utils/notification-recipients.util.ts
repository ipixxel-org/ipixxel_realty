import type { Prisma } from '@prisma/client';

/**
 * Who receives an organisation-level billing notification (subscription
 * expiry, package change approved/rejected): the org's active Admins, plus
 * optionally the member who triggered it (e.g. requested the package change).
 * Other members (Manager, Sales, Telecaller, custom roles) only ever get
 * notifications addressed to them personally.
 */
export function orgBillingRecipientsWhere(
  orgId: string,
  alsoUserId?: string | null,
): Prisma.UserWhereInput {
  return {
    orgId,
    status: 'active',
    OR: [
      { userRoles: { some: { role: { key: 'admin' } } } },
      ...(alsoUserId ? [{ id: alsoUserId }] : []),
    ],
  };
}
