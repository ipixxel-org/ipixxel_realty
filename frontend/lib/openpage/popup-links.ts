/**
 * Button / link URLs that open a lead form in a popup instead of navigating.
 *
 *   #popup                       → the page's default popup (main lead form)
 *   #popup:<embed ID or form ID> → a popup with that form
 *   …/embed/form/<embed ID>      → the form's own page URL (Forms → Embed →
 *                                  IFRAME src); opens that form in a popup
 *
 * Any other URL is not a popup link and keeps working as before.
 */

export type PopupLinkTarget = {
  /** Form embed ID or form ID; empty for the page's default popup. */
  ref: string;
  /** True when it was a full form URL — on failure we can still go there. */
  fromUrl: boolean;
};

const EMBED_PATH = /^\/embed\/form\/([^/?#]+)\/?$/;

export function popupTargetFromHref(href: string | null | undefined): PopupLinkTarget | null {
  const raw = (href ?? "").trim();
  if (!raw) return null;

  const hash = /^#popup(?::(.*))?$/i.exec(raw);
  if (hash) return { ref: safeDecode(hash[1] ?? "").trim(), fromUrl: false };

  if (!/embed\/form\//i.test(raw)) return null;
  try {
    const url = new URL(raw, "http://local.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const m = EMBED_PATH.exec(url.pathname);
    return m ? { ref: safeDecode(m[1]), fromUrl: true } : null;
  } catch {
    return null;
  }
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
