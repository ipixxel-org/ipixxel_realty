import { createHmac, timingSafeEqual } from 'node:crypto';
import * as path from 'path';

// Local-dev stand-in for signed R2 URLs (used only when R2 isn't configured).
// Files live under `private-uploads/` — deliberately NOT the statically served
// `uploads/` directory — and every PUT/GET URL carries an expiry plus an HMAC
// over its parameters, so a URL can't be altered or reused after it expires.

export const LOCAL_PRIVATE_ROOT = () =>
  path.join(process.cwd(), 'private-uploads');

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required to sign private file URLs');
  return `private-files:${s}`;
}

export function signLocalPrivate(parts: Array<string | number>): string {
  return createHmac('sha256', secret())
    .update(parts.map(String).join('\n'))
    .digest('base64url');
}

export function verifyLocalPrivate(
  parts: Array<string | number>,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000))
    return false;
  const expected = Buffer.from(signLocalPrivate(parts));
  const given = Buffer.from(sig || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Keys are generated server-side, but never let one escape the root. */
export function isSafePrivateKey(key: string): boolean {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= 512 &&
    !key.startsWith('/') &&
    !key.includes('\\') &&
    key.split('/').every((p) => p !== '' && p !== '.' && p !== '..')
  );
}
