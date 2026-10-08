// Field types the storage service knows how to validate + place. Adding a
// new one here (with a rule below) is all another module needs to reuse
// this service for its own media.
export type UploadField =
  | 'amenityIcon'
  | 'floorPlan'
  | 'gallery'
  | 'brochure'
  | 'video'
  // Images placed into a template / landing-page's builder `content` JSON —
  // replaces the old base64-data-URI-in-JSON approach that caused 413s.
  | 'builderImage'
  // Organisation logo — Business Details step of the signup wizard, and
  // /org/settings later. Organisation always exists by upload time (it's
  // created at Step 2, logo is Step 3), so this is a normal org-scoped
  // upload, no pre-org nonce scheme needed.
  | 'logo'
  // Organisation favicon — same lifecycle as the logo, uploaded from the
  // Super Admin org-detail edit form. Smaller size cap and .ico allowed.
  | 'favicon'
  // A support-ticket attachment (screenshot / PDF) — org side, from the
  // Support & Help "Contact support" form or a reply in the chat thread.
  | 'supportAttachment'
  // General media library upload — images, videos, documents, icons, logos
  | 'media';

export const UPLOAD_FIELDS: readonly UploadField[] = [
  'amenityIcon',
  'floorPlan',
  'gallery',
  'brochure',
  'video',
  'builderImage',
  'logo',
  'favicon',
  'supportAttachment',
  'media',
] as const;

export interface FieldRule {
  /** Allowed MIME types (exact match, lower-cased). */
  mimeTypes: readonly string[];
  /** Hard upper bound in bytes, enforced before a URL is ever signed. */
  maxBytes: number;
  /** Human label for error messages. */
  label: string;
}

const MB = 1024 * 1024;

const IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const FIELD_RULES: Record<UploadField, FieldRule> = {
  amenityIcon: {
    mimeTypes: [...IMAGE_MIMES, 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'],
    maxBytes: 512 * 1024,
    label: 'amenity icon',
  },
  floorPlan: {
    mimeTypes: IMAGE_MIMES,
    maxBytes: 5 * MB,
    label: 'floor plan',
  },
  gallery: {
    mimeTypes: IMAGE_MIMES,
    maxBytes: 5 * MB,
    label: 'gallery image',
  },
  brochure: {
    mimeTypes: ['application/pdf'],
    maxBytes: 15 * MB,
    label: 'brochure',
  },
  video: {
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    maxBytes: 100 * MB,
    label: 'video',
  },
  builderImage: {
    mimeTypes: [...IMAGE_MIMES, 'image/svg+xml'],
    maxBytes: 5 * MB,
    label: 'image',
  },
  logo: {
    mimeTypes: [...IMAGE_MIMES, 'image/svg+xml'],
    maxBytes: 2 * MB,
    label: 'logo',
  },
  favicon: {
    mimeTypes: [
      ...IMAGE_MIMES,
      'image/svg+xml',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ],
    maxBytes: 512 * 1024,
    label: 'favicon',
  },
  supportAttachment: {
    mimeTypes: ['image/png', 'image/jpeg', 'application/pdf'],
    maxBytes: 10 * MB,
    label: 'attachment',
  },
  media: {
    mimeTypes: [
      ...IMAGE_MIMES,
      'image/svg+xml',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'application/zip',
      'application/x-zip-compressed',
    ],
    maxBytes: 100 * MB,
    label: 'media asset',
  },
};

export interface CreateUploadUrlInput {
  /** The caller's own org (from the JWT) — never client-supplied. Absent
   *  only for a platform-level upload (e.g. the Super Admin template
   *  builder), which is keyed under `platform/` instead of `org/{orgId}/`. */
  orgId?: string;
  field: UploadField;
  filename: string;
  contentType: string;
  size: number;
  /** Optional scoping context — used only to build a tidy key path. */
  projectId?: string;
  unitTypeId?: string;
  templateId?: string;
  landingPageId?: string;
  folder?: string;
}

export interface CreateUploadUrlResult {
  /** Short-lived presigned PUT URL — browser uploads the bytes directly. */
  uploadUrl: string;
  /** Stable public URL to store as the field value once the PUT succeeds. */
  publicUrl: string;
  /** The object key (for debugging / future cleanup tooling). */
  key: string;
  /** Seconds until `uploadUrl` expires. */
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Private objects (Team Chat attachments) — see StorageService.
// ---------------------------------------------------------------------------

export interface CreatePrivateUploadUrlInput {
  /** The caller's own org (from the JWT). */
  orgId: string;
  /** Top-level key prefix, e.g. 'team-chat'. */
  scope: string;
  filename: string;
  /** Any type is accepted; unknown/empty becomes application/octet-stream. */
  contentType: string;
  size: number;
  maxBytes: number;
}

export interface CreatePrivateUploadUrlResult {
  /** Short-lived signed PUT URL. The browser must send `contentType` as its
   *  Content-Type header (it is part of the signature). */
  uploadUrl: string;
  key: string;
  contentType: string;
  expiresIn: number;
}

export interface CreatePrivateDownloadUrlInput {
  key: string;
  fileName: string;
  contentType: string;
  /** `attachment` forces a download; use `inline` only for media types that
   *  are safe to render (images other than SVG, video). */
  disposition: 'inline' | 'attachment';
  ttlSeconds?: number;
}
