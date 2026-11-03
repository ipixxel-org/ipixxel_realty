import type { AdminLeadStatus } from "./types";

export const ADMIN_LEAD_STATUS_ORDER: AdminLeadStatus[] = [
  "new",
  "contacted",
  "connected",
  "follow_up",
  "interested",
  "not_interested",
  "converted",
  "lost",
];

export const ADMIN_LEAD_STATUS_META: Record<
  AdminLeadStatus,
  { label: string; color: string }
> = {
  new: { label: "New", color: "#94a3b8" },
  contacted: { label: "Contacted", color: "#0ea5e9" },
  connected: { label: "Connected", color: "#14b8a6" },
  follow_up: { label: "Follow-up", color: "#f59e0b" },
  interested: { label: "Interested", color: "#6366f1" },
  not_interested: { label: "Not Interested", color: "#f97316" },
  converted: { label: "Converted", color: "#16a34a" },
  lost: { label: "Lost", color: "#e11d48" },
};

export function adminLeadStatusLabel(status: AdminLeadStatus): string {
  return ADMIN_LEAD_STATUS_META[status]?.label ?? status;
}

export function adminLeadStatusTint(hexColor: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hexColor) ? `${hexColor}1f` : "#eef1f6";
}

export function formatAdminLeadDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}, ${d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function timeAgo(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function toDateTimeLocal(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
}
