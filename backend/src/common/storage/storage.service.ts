import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CreatePrivateDownloadUrlInput,
  CreatePrivateUploadUrlInput,
  CreatePrivateUploadUrlResult,
  CreateUploadUrlInput,
  CreateUploadUrlResult,
  FIELD_RULES,
  UploadField,
} from './storage.types';
import {
  isSafeStorageKey,
  LOCAL_PRIVATE_ROOT,
  signLocalUrl,
} from './private-local.util';

// Presigned PUT URLs are valid for 10 minutes — long enough for a slow
// mobile upload, short enough that a leaked URL is near-useless.
const PRESIGN_TTL_SECONDS = 10 * 60;

/**
 * Generic object-storage helper for the whole backend (Cloudflare R2, which
 * is S3-compatible, with local disk storage fallback in dev mode).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  private env() {
    const {
      R2_ENDPOINT,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      R2_PUBLIC_URL,
    } = process.env;
    if (!this.isConfigured()) {
      return {
        endpoint: '',
        accessKeyId: '',
        secretAccessKey: '',
        bucket: 'local-dev',
        publicUrl: process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`,
      };
    }
    return {
      endpoint: (R2_ENDPOINT || '').replace(/\/+$/, ''),
      accessKeyId: R2_ACCESS_KEY_ID || '',
      secretAccessKey: R2_SECRET_ACCESS_KEY || '',
      bucket: R2_BUCKET_NAME || 'media',
      publicUrl: (R2_PUBLIC_URL || '').replace(/\/+$/, ''),
    };
  }

  private s3(): S3Client {
    if (this.client) return this.client;
    const { endpoint, accessKeyId, secretAccessKey } = this.env();
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return this.client;
  }

  /** True when all five R2_* vars are present and not placeholders. */
  isConfigured(): boolean {
    const {
      R2_ENDPOINT,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      R2_PUBLIC_URL,
    } = process.env;

    return Boolean(
      R2_ENDPOINT &&
        !R2_ENDPOINT.includes('your-account-id') &&
        R2_ACCESS_KEY_ID &&
        !R2_ACCESS_KEY_ID.includes('r2-access-key-id') &&
        R2_SECRET_ACCESS_KEY &&
        R2_BUCKET_NAME &&
        R2_PUBLIC_URL &&
        !R2_PUBLIC_URL.includes('example.com'),
    );
  }

  async createUploadUrl(
    input: CreateUploadUrlInput,
  ): Promise<CreateUploadUrlResult> {
    const rule = FIELD_RULES[input.field];
    if (!rule) {
      throw new BadRequestException(`Unknown upload field "${input.field}".`);
    }

    // --- validate BEFORE signing anything ---
    const contentType = (input.contentType || '').toLowerCase().trim();
    if (!rule.mimeTypes.includes(contentType)) {
      throw new BadRequestException(
        `A ${rule.label} must be one of: ${rule.mimeTypes.join(', ')}.`,
      );
    }
    if (!Number.isFinite(input.size) || input.size <= 0) {
      throw new BadRequestException('A valid file size is required.');
    }
    if (input.size > rule.maxBytes) {
      throw new BadRequestException(
        `That ${rule.label} is too large — the limit is ${formatMb(rule.maxBytes)}.`,
      );
    }

    const key = this.buildKey(input);

    // --- Local storage fallback when R2 is not configured ---
    if (!this.isConfigured()) {
      const port = process.env.PORT || '4000';
      const baseUrl = process.env.PUBLIC_BACKEND_URL || `http://localhost:${port}`;
      // Signed like an R2 presign: bound to this key, type, size and expiry
      // (see LocalUploadController).
      const exp = Math.floor(Date.now() / 1000) + PRESIGN_TTL_SECONDS;
      const sig = signLocalUrl(['public-put', key, exp, contentType, input.size]);
      const qs = new URLSearchParams({
        key,
        exp: String(exp),
        ct: contentType,
        size: String(input.size),
        sig,
      });
      const uploadUrl = `${baseUrl}/uploads/local-put?${qs.toString()}`;
      const publicUrl = `${baseUrl}/uploads/${key}`;

      return {
        uploadUrl,
        publicUrl,
        key,
        expiresIn: PRESIGN_TTL_SECONDS,
      };
    }

    const { bucket, publicUrl } = this.env();

    const uploadUrl = await getSignedUrl(
      this.s3(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );

    return {
      uploadUrl,
      publicUrl: `${publicUrl}/${key}`,
      key,
      expiresIn: PRESIGN_TTL_SECONDS,
    };
  }

  async deleteObject(key: string): Promise<void> {
    if (!key) return;
    if (!this.isConfigured()) {
      try {
        const safeKey = path.normalize(key).replace(/^(\.\.[\/\\])+/, '');
        const localPath = path.join(process.cwd(), 'uploads', safeKey);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (err) {
        this.logger.error(`Failed to delete local storage key "${key}": ${err}`);
      }
      return;
    }
    try {
      const { bucket } = this.env();
      await this.s3().send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } catch (err) {
        this.logger.error(`Failed to delete storage key "${key}": ${err}`);
    }
  }

  // -------------------------------------------------------------------------
  // Private objects (Team Chat attachments)
  //
  // The main bucket is public — everything in it is reachable through
  // R2_PUBLIC_URL — so private files go to a SEPARATE bucket that has no
  // public access (R2_PRIVATE_BUCKET_NAME) and are only ever handed out as
  // short-lived signed GET URLs.
  //
  // The private bucket has its OWN API token (R2_PRIVATE_*), used through a
  // separate S3 client for every private operation — the public bucket's
  // credentials are never used for chat files, and these never for anything
  // else. Missing or half-set private config refuses with 503; there is no
  // fallback to the public bucket. Only when no R2 is configured at all
  // (local dev) do files go to `private-uploads/` — NOT under the static
  // `/uploads` route — served by PrivateFilesController behind an
  // HMAC-signed, expiring URL.
  // -------------------------------------------------------------------------

  private privateClient: S3Client | null = null;

  /**
   * 'r2' when the private bucket is fully configured, 'local' only when no
   * R2 storage is configured at all; anything in between throws 503.
   * Error messages name variables, never their values.
   */
  privateStorageMode(): 'r2' | 'local' {
    const cfg = this.privateEnv();
    if (cfg.complete) return 'r2';
    if (!cfg.anySet && !this.isConfigured()) return 'local';
    throw new ServiceUnavailableException(
      `Private file storage is not configured (${cfg.problem}).`,
    );
  }

  private privateEnv() {
    const env = process.env;
    const bucket = env.R2_PRIVATE_BUCKET_NAME?.trim() ?? '';
    const accessKeyId = env.R2_PRIVATE_ACCESS_KEY_ID?.trim() ?? '';
    const secretAccessKey = env.R2_PRIVATE_SECRET_ACCESS_KEY?.trim() ?? '';
    const accountId = env.R2_PRIVATE_ACCOUNT_ID?.trim() ?? '';
    // Same account as the public bucket unless told otherwise.
    const endpoint = (
      env.R2_PRIVATE_ENDPOINT?.trim() ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '') ||
      env.R2_ENDPOINT?.trim() ||
      ''
    ).replace(/\/+$/, '');

    const anySet = Boolean(
      bucket || accessKeyId || secretAccessKey || accountId || env.R2_PRIVATE_ENDPOINT,
    );
    let problem = '';
    if (!bucket) problem = 'R2_PRIVATE_BUCKET_NAME is missing';
    else if (!accessKeyId || !secretAccessKey)
      problem = 'R2_PRIVATE_ACCESS_KEY_ID / R2_PRIVATE_SECRET_ACCESS_KEY are missing';
    else if (!endpoint || endpoint.includes('your-account-id'))
      problem = 'no endpoint: set R2_PRIVATE_ENDPOINT, R2_PRIVATE_ACCOUNT_ID or R2_ENDPOINT';
    else if (bucket === env.R2_BUCKET_NAME?.trim())
      problem = 'R2_PRIVATE_BUCKET_NAME must differ from R2_BUCKET_NAME';
    else if (accessKeyId === env.R2_ACCESS_KEY_ID?.trim())
      problem = 'R2_PRIVATE_ACCESS_KEY_ID must be the private bucket\'s own token, not R2_ACCESS_KEY_ID';

    return {
      complete: !problem,
      anySet,
      problem,
      bucket,
      endpoint,
      accessKeyId,
      secretAccessKey,
    };
  }

  /** The private bucket's own client and name. Throws 503 if unconfigured. */
  private privateS3(): { client: S3Client; bucket: string } {
    if (this.privateStorageMode() !== 'r2') {
      throw new ServiceUnavailableException('Private R2 storage is not configured.');
    }
    const cfg = this.privateEnv();
    if (!this.privateClient) {
      this.privateClient = new S3Client({
        region: 'auto',
        endpoint: cfg.endpoint,
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    }
    return { client: this.privateClient, bucket: cfg.bucket };
  }

  async deletePrivateObject(key: string): Promise<void> {
    if (!key) return;
    if (this.privateStorageMode() === 'local') {
      if (isSafeStorageKey(key)) {
        fs.rmSync(this.localPrivatePath(key), { force: true });
      }
      return;
    }
    const { client, bucket } = this.privateS3();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      this.logger.error(`Failed to delete private object "${key}": ${name}`);
    }
  }

  async createPrivateUploadUrl(
    input: CreatePrivateUploadUrlInput,
  ): Promise<CreatePrivateUploadUrlResult> {
    if (!Number.isFinite(input.size) || input.size <= 0) {
      throw new BadRequestException('A valid file size is required.');
    }
    if (input.size > input.maxBytes) {
      throw new BadRequestException(
        `That file is too large — the limit is ${formatMb(input.maxBytes)}.`,
      );
    }
    const contentType = normalizeContentType(input.contentType);
    const now = new Date();
    const key = [
      seg(input.scope),
      seg(input.orgId),
      now.getFullYear().toString(),
      String(now.getMonth() + 1).padStart(2, '0'),
      `${randomUUID()}-${sanitizeFilename(input.filename)}`,
    ].join('/');

    if (this.privateStorageMode() === 'local') {
      const exp = Math.floor(Date.now() / 1000) + PRESIGN_TTL_SECONDS;
      const sig = signLocalUrl(['put', key, exp, contentType, input.size]);
      const qs = new URLSearchParams({
        key,
        exp: String(exp),
        ct: contentType,
        size: String(input.size),
        sig,
      });
      return {
        uploadUrl: `${this.localBaseUrl()}/files/private/put?${qs.toString()}`,
        key,
        contentType,
        expiresIn: PRESIGN_TTL_SECONDS,
      };
    }

    const { client, bucket } = this.privateS3();
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: input.size,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    return { uploadUrl, key, contentType, expiresIn: PRESIGN_TTL_SECONDS };
  }

  async createPrivateDownloadUrl(
    input: CreatePrivateDownloadUrlInput,
  ): Promise<{ url: string; expiresIn: number }> {
    const ttl = input.ttlSeconds ?? 5 * 60;
    const contentType = normalizeContentType(input.contentType);
    const disposition = contentDisposition(input.disposition, input.fileName);

    if (this.privateStorageMode() === 'local') {
      const exp = Math.floor(Date.now() / 1000) + ttl;
      const sig = signLocalUrl(['get', input.key, exp, contentType, disposition]);
      const qs = new URLSearchParams({
        key: input.key,
        exp: String(exp),
        ct: contentType,
        cd: disposition,
        sig,
      });
      return {
        url: `${this.localBaseUrl()}/files/private/get?${qs.toString()}`,
        expiresIn: ttl,
      };
    }

    const { client, bucket } = this.privateS3();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ResponseContentType: contentType,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: ttl },
    );
    return { url, expiresIn: ttl };
  }

  /** Where a local-dev private file lives on disk (never statically served). */
  localPrivatePath(key: string): string {
    return path.join(LOCAL_PRIVATE_ROOT(), ...key.split('/'));
  }

  private localBaseUrl(): string {
    const port = process.env.PORT || '4000';
    return (
      process.env.PUBLIC_BACKEND_URL || `http://localhost:${port}`
    ).replace(/\/+$/, '');
  }

  // Key layout is decided here, server-side. Org-scoped content lives under
  // a single top-level `org/{orgId}/` prefix; platform-level content (no
  // orgId — e.g. the Super Admin template builder) under `platform/`. The
  // orgId segment is the caller's own (from the JWT) so no org can ever get
  // a URL that writes into another org's prefix.
  private buildKey(input: CreateUploadUrlInput): string {
    const safeName = sanitizeFilename(input.filename);
    const unique = `${randomUUID()}-${safeName}`;
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const root = input.orgId ? ['org', input.orgId] : ['platform'];
    const timePath = [year, month];

    if (input.landingPageId) {
      return [
        ...root,
        ...timePath,
        'landing-pages',
        seg(input.landingPageId),
        'images',
        unique,
      ].join('/');
    }
    if (input.templateId) {
      return [
        ...root,
        ...timePath,
        'templates',
        seg(input.templateId),
        'images',
        unique,
      ].join('/');
    }

    const parts = [...root, ...timePath];
    if (input.projectId) {
      parts.push('projects', input.projectId);
      if (input.unitTypeId) {
        parts.push('unit-types', input.unitTypeId);
      } else if (input.field === 'amenityIcon') {
        parts.push('amenities');
      } else {
        parts.push('unit-types', '_pending');
      }
    } else {
      parts.push(input.folder || 'general');
    }
    parts.push(unique);
    return parts.join('/');
  }
}

// Defensive: context ids come from validated UUID DTO fields, but never let
// a stray `/` or `..` into a key path.
function seg(value: string): string {
  return value.replace(/[^\w-]+/g, '') || 'x';
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Browsers send '' for unknown types; anything not type/subtype-shaped is
 *  stored as an opaque binary. */
function normalizeContentType(value: string | undefined): string {
  const ct = (value || '').trim().toLowerCase();
  return /^[\w.+-]+\/[\w.+-]+$/.test(ct) ? ct : 'application/octet-stream';
}

/** RFC 6266 header with an ASCII fallback plus the UTF-8 original. */
function contentDisposition(
  kind: 'inline' | 'attachment',
  fileName: string,
): string {
  const ascii = (fileName || 'file').replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(fileName || 'file');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

function sanitizeFilename(name: string): string {
  const base = (name || 'file').split(/[\\/]/).pop() || 'file';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
  return cleaned || 'file';
}
