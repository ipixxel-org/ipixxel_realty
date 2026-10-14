/**
 * Login refusal for a paused user. The backend rejects sign-in with HTTP 403
 * and body `{ code: "account_paused", orgName, ownerName, planName, planUserLimit }`.
 */
export interface PausedAccountInfo {
  orgName: string;
  ownerName: string;
  planName: string;
  userLimit: number;
}

export function pausedAccountFromError(err: unknown): PausedAccountInfo | null {
  const body = (err as { body?: Record<string, unknown> } | null)?.body;
  if (!body || body.code !== "account_paused") return null;
  return {
    orgName: String(body.orgName ?? "Your organisation"),
    ownerName: String(body.ownerName ?? "the owner"),
    planName: String(body.planName ?? "Basic"),
    userLimit: Number(body.planUserLimit ?? 0),
  };
}
