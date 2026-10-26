export interface JwtPayload {
  sub: string;
  orgId: string | null;
  roles: string[];
  // Differentiates short-lived signup/OAuth tokens signed with the same
  // secret from real access tokens; the auth guard rejects anything else.
  typ?: 'access';
  // Added automatically by JwtService when signing / verifying. Present on
  // every verified request; used by OrgApprovedGuard to reject access tokens
  // issued before the user's `tokenInvalidBefore` stamp.
  iat?: number;
  exp?: number;
}
