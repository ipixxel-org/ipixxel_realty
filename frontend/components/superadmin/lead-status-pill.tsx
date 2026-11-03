import {
  ADMIN_LEAD_STATUS_META,
  adminLeadStatusTint,
} from "@/lib/admin-leads";
import type { AdminLeadStatus } from "@/lib/types";

export function LeadStatusPill({
  status,
  style,
}: {
  status: AdminLeadStatus;
  style?: React.CSSProperties;
}) {
  const meta = ADMIN_LEAD_STATUS_META[status] ?? {
    label: status,
    color: "#94a3b8",
  };
  return (
    <span
      className="badge"
      style={{
        background: adminLeadStatusTint(meta.color),
        color: meta.color,
        ...style,
      }}
    >
      {meta.label}
    </span>
  );
}
