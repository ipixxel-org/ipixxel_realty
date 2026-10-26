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

  // Security headers & hide backend framework fingerprint
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy: false,
    }),
  );
  app.disable('x-powered-by');

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
        origin.endsWith('.ipixxel.org') ||
        origin.endsWith('.localhost:3000') ||
        origin.endsWith('.localhost:3001') ||
        process.env.NODE_ENV !== 'production';
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
