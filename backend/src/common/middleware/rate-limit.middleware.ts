import type { NextFunction, Request, Response } from 'express';

type RateLimitRule = {
  prefix: string;
  windowMs: number;
  max: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

// Deliberately small and dependency-free: this project does not ship
// @nestjs/throttler. Keys are per-IP + route prefix; counters are in-memory,
// which is enough for a single instance and resets on restart.
const RULES: RateLimitRule[] = [
  { prefix: '/auth/login', windowMs: 15 * 60_000, max: 10 },
  { prefix: '/auth/signup/step1', windowMs: 60 * 60_000, max: 30 },
  { prefix: '/auth/signup', windowMs: 60 * 60_000, max: 20 },
  { prefix: '/auth/google', windowMs: 15 * 60_000, max: 30 },
  { prefix: '/auth/forgot-password', windowMs: 60 * 60_000, max: 10 },
  { prefix: '/auth/reset-password', windowMs: 60 * 60_000, max: 10 },
  { prefix: '/auth/resend-verification', windowMs: 60 * 60_000, max: 10 },
  { prefix: '/public/site/track', windowMs: 60_000, max: 120 },
];

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0];
    if (first?.trim()) return first.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function pruneIfNeeded(now: number) {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const path = (req.path || req.url.split('?')[0] || '').toLowerCase();
  const rule = RULES.find(
    (candidate) =>
      path === candidate.prefix || path.startsWith(`${candidate.prefix}/`),
  );
  if (!rule) return next();

  const now = Date.now();
  pruneIfNeeded(now);
  const key = `${clientKey(req)}:${rule.prefix}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return next();
  }

  current.count += 1;
  if (current.count > rule.max) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many attempts. Please try again later.',
    });
  }

  return next();
}
