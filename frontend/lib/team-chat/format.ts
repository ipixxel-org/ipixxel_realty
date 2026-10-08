// Display helpers for Team Chat (times, last seen, previews, typing lines).

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const DAY = 24 * 60 * 60 * 1000;

function dayDiff(date: Date, now = new Date()): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY);
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "3 Oct" this year, "3 Oct 2025" otherwise. */
export function shortDate(date: Date, now = new Date()): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Rail timestamp: time today, "Yesterday", weekday this week, else a date. */
export function railTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff <= 0) return timeOfDay(iso);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return shortDate(d, now);
}

/** Date separator in a thread: Today / Yesterday / Monday / 3 Oct. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return shortDate(d, now);
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();
}

/** "last seen today at 4:12 PM" / "last seen yesterday at 9:03 AM" / "last seen 3 Oct". */
export function lastSeenLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const diff = dayDiff(new Date(iso), now);
  if (diff <= 0) return `last seen today at ${timeOfDay(iso)}`;
  if (diff === 1) return `last seen yesterday at ${timeOfDay(iso)}`;
  return `last seen ${shortDate(new Date(iso), now)}`;
}

/** "Priya is typing…" / "Priya and Ravi are typing…" / "Priya and 2 others are typing…". */
export function typingLine(names: string[]): string {
  if (names.length === 0) return "";
  const first = names[0].split(" ")[0];
  if (names.length === 1) return `${first} is typing…`;
  if (names.length === 2) return `${first} and ${names[1].split(" ")[0]} are typing…`;
  return `${first} and ${names.length - 1} others are typing…`;
}

export function previewOf(m: {
  body: string;
  deletedAt: string | null;
  attachments?: { fileName: string; mimeType?: string }[];
}): string {
  if (m.deletedAt) return "This message was deleted";
  const body = m.body.trim();
  if (body) return body.length > 120 ? `${body.slice(0, 120)}…` : body;
  const file = m.attachments?.[0];
  if (!file) return "📎 Attachment";
  if (file.mimeType?.startsWith("image/")) return "📷 Photo";
  if (file.mimeType?.startsWith("video/")) return "🎥 Video";
  return `📎 ${file.fileName}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#b45309"];

export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** 32 hex chars — valid for the API's clientMsgId (8-64 of [A-Za-z0-9_-]). */
export function newClientMsgId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
