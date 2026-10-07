import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Local-dev stand-in for signed R2 URLs (used only when R2 isn't configured).
// Every local PUT/GET URL carries an expiry plus an HMAC over its parameters
// (purpose, key, expiry, content type, size…), so a URL can't be altered or
// reused after it expires. Public uploads land in `uploads/`; private files
// (Team Chat) in `private-uploads/`, which is NOT statically served.

export const LOCAL_PRIVATE_ROOT = () =>
  path.join(process.cwd(), 'private-uploads');

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required to sign private file URLs');
  return `private-files:${s}`;
}

export function signLocalUrl(parts: Array<string | number>): string {
  return createHmac('sha256', secret())
    .update(parts.map(String).join('\n'))
    .digest('base64url');
}

export function verifyLocalUrl(
  parts: Array<string | number>,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000))
    return false;
  const expected = Buffer.from(signLocalUrl(parts));
  const given = Buffer.from(sig || '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Keys are generated server-side, but never let one escape the root. */
export function isSafeStorageKey(key: string): boolean {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= 512 &&
    !key.startsWith('/') &&
    !key.includes('\\') &&
    key.split('/').every((p) => p !== '' && p !== '.' && p !== '..')
  );
}

/** The request's media type without parameters, lower-cased. */
export function requestContentType(req: Request): string {
  return String(req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

/**
 * Streams the request body to `target`, counting bytes as they arrive (the
 * Content-Length header is never trusted). Exceeding `maxBytes` aborts the
 * upload with 413 and removes the partial file.
 */
export function streamUploadToFile(
  req: Request,
  res: Response,
  target: string,
  maxBytes: number,
): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const out = fs.createWriteStream(target);
  let received = 0;
  let aborted = false;

  const fail = (status: number, error: string) => {
    if (aborted) return;
    aborted = true;
    req.unpipe(out);
    // Delete only once the handle is closed (Windows refuses to remove an
    // open file), then answer — so no partial file outlives the response.
    out.once('close', () => {
      fs.rm(target, { force: true }, () => {
        if (!res.headersSent) res.status(status).json({ error });
      });
    });
    out.destroy();
    // Drain (and discard) the rest of an oversized body.
    req.resume();
  };

  req.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (received > maxBytes) fail(413, 'File too large');
  });
  req.on('error', () => fail(400, 'Upload interrupted'));
  out.on('error', (err) => fail(500, err.message));
  out.on('finish', () => {
    if (!aborted && !res.headersSent) res.status(200).send('OK');
  });
  req.pipe(out);
}
