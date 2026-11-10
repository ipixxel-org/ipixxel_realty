import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded, type Request, type Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { rateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { join } from 'path';

async function bootstrap() {
  // Disable Nest's built-in body parser so we can capture rawBody for Meta
  // webhook HMAC verification, then re-enable JSON/urlencoded ourselves.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Trust first proxy hop (e.g. Cloudflare, Nginx, ALB) for accurate client IP resolution
  app.set('trust proxy', 1);

  // Security headers & hide backend framework fingerprint.
  // Clickjacking protection enabled globally (SAMEORIGIN); embed routes override this below.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy: false,
      frameguard: { action: 'sameorigin' },
    }),
  );
  app.disable('x-powered-by');

  // Allow iframe embedding strictly for public lead capture and preview forms
  app.use((req: Request, res: Response, next: () => void) => {
    const url = req.path || req.url || '';
    if (url.startsWith('/embed/') || url.startsWith('/live/') || url.startsWith('/public/forms/')) {
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
    }
    next();
  });

  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.PUBLIC_BACKEND_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000',
  ]
    .filter(Boolean)
    .map((u) => (u as string).replace(/\/$/, ''));

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser calls with no origin (mobile apps, server-to-server webhooks)
      if (!origin) return callback(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) ||
        /^https?:\/\/([a-z0-9-]+\.)*ipixxel\.org(:[0-9]+)?$/i.test(origin) ||
        /^https?:\/\/[a-z0-9-]+\.localhost(:[0-9]+)?$/i.test(origin) ||
        (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/i.test(origin));
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (filePath.toLowerCase().endsWith('.svg')) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      }
    },
  });

  const rawBodySaver = {
    verify: (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
      if (buf?.length) req.rawBody = buf;
    },
  };
  // Template/landing-page content (sections + config, often with embedded
  // thumbnail data) regularly exceeds Express's 100kb default body limit.
  app.use(json({ limit: '15mb', ...rawBodySaver }));
  app.use(urlencoded({ extended: true, limit: '15mb', ...rawBodySaver }));

  app.use(rateLimitMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = Number(process.env.PORT) || 3000;
  // Bind IPv4 explicitly. Default Node/Nest `listen(port)` often binds `::`
  // only; Next.js then proxies to 127.0.0.1 and every /api/* returns 500.
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
