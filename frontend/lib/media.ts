const MAX_BYTES = 2.5 * 1024 * 1024;

export function isMediaSrc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  return (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("data:image") ||
    v.startsWith("blob:") ||
    (v.startsWith("/") && !v.startsWith("//"))
  );
}

export function cssUrl(src: string): string {
  return `url(${JSON.stringify(src)})`;
}

export function readMediaFile(file: File): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const okType = file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".svg") || file.name.toLowerCase().endsWith(".ico");
    if (!okType) {
      resolve({ ok: false, error: "Choose a PNG, JPG, SVG, WebP, GIF or ICO file" });
      return;
    }
    if (file.size > MAX_BYTES) {
      resolve({ ok: false, error: "Keep uploads under 2.5 MB" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result : "";
      if (!data) {
        resolve({ ok: false, error: "Could not read that file" });
        return;
      }
      resolve({ ok: true, data });
    };
    reader.onerror = () => resolve({ ok: false, error: "Could not read that file" });
    reader.readAsDataURL(file);
  });
}

const IMAGE_KEYS = /^(image|src|logo|thumbnail|ogimage|favicon|heroart|poster|photo|avatar|bgimage|backgroundimage|cover|iconsrc)$/i;
const IMAGE_HINT = /image|logo|thumb|photo|poster|favicon|ogimage|heroart|cover|avatar/i;
const ICON_KEYS = /^(icon|iconname)$/i;
const IMAGE_LIST_KEYS = /^(images|gallery|photos|slides|files)$/i;

export function isImageFieldKey(key: string): boolean {
  return IMAGE_KEYS.test(key) || IMAGE_HINT.test(key);
}

export function isIconFieldKey(key: string, widgetType?: string): boolean {
  if (ICON_KEYS.test(key)) return true;
  return widgetType === "icon" && key === "name";
}

export function isImageListKey(key: string): boolean {
  return IMAGE_LIST_KEYS.test(key);
}
