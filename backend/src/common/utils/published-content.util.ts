import { Prisma } from '@prisma/client';
import { deepEqual } from './deep-equal.util';

/**
 * A landing page has two versions: `content` (what the builder edits) and
 * `publishedContent` (the snapshot taken on Publish, which visitors see).
 * Editing a live page only changes `content`; Publish copies it across.
 * Pages published before the snapshot existed have `publishedContent` null
 * and fall back to `content`.
 */
type Versioned = {
  content: Prisma.JsonValue;
  publishedContent?: Prisma.JsonValue | null;
};

/** The content visitors see. */
export function liveContent(page: Versioned): Prisma.JsonValue {
  return page.publishedContent ?? page.content;
}

/** A public copy of the page: `content` is the live version, no snapshot field. */
export function withLiveContent<T extends Versioned>(page: T): Omit<T, 'publishedContent'> {
  const { publishedContent: _snapshot, ...rest } = page;
  return { ...rest, content: liveContent(page) };
}

/** True when a live page has edits that aren't published yet. */
export function hasUnpublishedChanges(page: Versioned & { status: string }): boolean {
  if (page.status !== 'published' || page.publishedContent == null) return false;
  return !deepEqual(page.content, page.publishedContent);
}

/**
 * Write to apply when a live page's content is about to change. The first
 * edit of a page that has no snapshot yet freezes the current content as
 * the live version, so the edit doesn't go live without a Publish.
 */
export function snapshotBeforeEdit(
  page: Versioned & { status: string },
): { publishedContent: Prisma.InputJsonValue } | Record<string, never> {
  if (page.status === 'published' && page.publishedContent == null) {
    return { publishedContent: page.content as Prisma.InputJsonValue };
  }
  return {};
}

/** The owner's (builder) view: the draft plus a flag, without the snapshot payload. */
export function toOwnerView<T extends Versioned & { status: string }>(
  page: T,
): Omit<T, 'publishedContent'> & { hasUnpublishedChanges: boolean } {
  const { publishedContent: _snapshot, ...rest } = page;
  return { ...rest, hasUnpublishedChanges: hasUnpublishedChanges(page) };
}
