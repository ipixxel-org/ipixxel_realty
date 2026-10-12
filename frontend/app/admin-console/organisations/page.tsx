"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { Reveal } from "@/components/superadmin/reveal";
import { CountUp } from "@/components/superadmin/count-up";
import type {
  OrganisationListResponse,
  OrganisationListRow,
  OrganisationSummary,
  OrgIndustry,
  PendingSignupListResponse,
  PendingSignupRow,
} from "@/lib/types";
import { INDUSTRY_OPTIONS, industryShortLabel } from "@/lib/org-profile";
import { Icon, type IconName } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { RowActionsMenu, type RowAction } from "@/components/superadmin/row-actions-menu";
import { ReasonInfoPopover } from "@/components/superadmin/reason-info-popover";

// The "Rejected / Disabled" pill's status param covers both admin-disabled and
// rejected orgs (see the backend's list() query) — labelled to match.
// "Draft" is a separate bucket for abandoned self-serve signups and any
// Super-Admin-precreated org never assigned an admin. It has no pill of its
// own; drafts appear in "All" so incomplete onboarding attempts remain
// visible to Super Admin.
const LIMIT = 10;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function StatTile({
  icon,
  iconBg = "#eff6ff",
  iconColor = "#2563eb",
  label,
  value,
  sub,
  accent,
}: {
  icon?: IconName;
  iconBg?: string;
  iconColor?: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef2f6",
        borderRadius: 16,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        minWidth: 0,
      }}
    >
      {icon ? (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={20} />
        </div>
      ) : null}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 2 }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: accent ?? "#0f172a",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>
        {sub ? (
          <div
            style={{
              fontSize: 11.5,
              marginTop: 3,
              color: "#64748b",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const STATUS_PILLS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  // Hidden for now — pending orgs still show under "All". Uncomment to restore.
  // { value: "pending", label: "Pending" },
  { value: "disabled", label: "Rejected / Disabled" },
];

// Not an Organisation.status value — a separate mode entirely. These rows
// have no orgId, so they can never be one of the OrganisationListRow above
// (a fake org id would enable organisation actions against something that
// isn't one). Kept as its own statusFilter value purely so the existing
// pill-row UI can drive it, not because it's actually a status.
const PENDING_SIGNUPS_FILTER = "pending_signups";

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function SuperAdminOrganisationsPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading, hasPermission } = useAuth();
  const canViewOrganisations = hasPermission("admin_organisations", "view");
  const canActivateOrganisations = hasPermission("admin_organisations", "add");
  const canDeactivateOrganisations = hasPermission("admin_organisations", "approve");
  const canDeleteOrganisations = hasPermission("admin_organisations", "delete");

  const [statusFilter, setStatusFilter] = useState("all");
  // Organisation.industry ("role") filter — "" = all roles.
  const [industryFilter, setIndustryFilter] = useState<OrgIndustry | "">("");
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState<OrganisationSummary | null>(null);
  const [result, setResult] = useState<OrganisationListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Pending signups — a separate dataset entirely (Users, not
  // Organisations), fetched only while that filter is selected.
  const [pendingSignupsResult, setPendingSignupsResult] = useState<PendingSignupListResponse | null>(null);
  const [pendingSignupsLoading, setPendingSignupsLoading] = useState(false);
  const [pendingSignupsError, setPendingSignupsError] = useState<string | null>(null);
  const [signupDrawer, setSignupDrawer] = useState<PendingSignupRow | null>(null);
  const [deletingSignupId, setDeletingSignupId] = useState<string | null>(null);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchSummary = useCallback(() => {
    if (!accessToken) return;
    apiFetch<OrganisationSummary>("/admin/organisations/summary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(setSummary).catch(() => setSummary(null));
  }, [accessToken]);

  const fetchList = useCallback(() => {
    // Pending signups aren't organisations — status isn't even a valid
    // value for this endpoint (see ORG_LIST_STATUS_VALUES) — fetchPendingSignups
    // below owns that dataset instead.
    if (!accessToken || statusFilter === PENDING_SIGNUPS_FILTER) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
      status: statusFilter,
    });
    if (search) params.set("search", search);
    if (industryFilter) params.set("industry", industryFilter);
    apiFetch<OrganisationListResponse>(`/admin/organisations?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(setResult).catch((err) => setError(err instanceof Error ? err.message : "Failed to load organisations.")).finally(() => setLoading(false));
  }, [accessToken, statusFilter, search, page, industryFilter]);

  const fetchPendingSignups = useCallback(() => {
    if (!accessToken || statusFilter !== PENDING_SIGNUPS_FILTER) return;
    setPendingSignupsLoading(true);
    setPendingSignupsError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set("search", search);
    apiFetch<PendingSignupListResponse>(`/admin/organisations/pending-signups?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(setPendingSignupsResult)
      .catch((err) => setPendingSignupsError(err instanceof Error ? err.message : "Failed to load pending signups."))
      .finally(() => setPendingSignupsLoading(false));
  }, [accessToken, statusFilter, search, page]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchPendingSignups(); }, [fetchPendingSignups]);

  const handleApprove = async (id: string) => {
    if (!accessToken) return;
    setActionBusy(id);
    try {
      await apiFetch(`/admin/organisations/${id}/approve`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({}) });
      notify("Approved");
      fetchList(); fetchSummary();
    } catch (e: any) { notify(e.message || "Approve failed"); }
    finally { setActionBusy(null); }
  };
  const handleReject = (id: string, name: string) => {
    if (!accessToken) return;
    setRejectReason("");
    setRejectError(null);
    setRejectModal({ id, name });
  };
  const submitReject = async () => {
    if (!accessToken || !rejectModal) return;
    const reason = rejectReason.trim();
    if (reason.length === 0) {
      setRejectError("Please enter a reason before rejecting this organisation.");
      return;
    }
    if (reason.length < 3) {
      setRejectError("Reason must be at least 3 characters.");
      return;
    }
    setRejectError(null);
    const { id } = rejectModal;
    setRejectSubmitting(true);
    setActionBusy(id);
    try {
      await apiFetch(`/admin/organisations/${id}/reject`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ reason }) });
      notify("Rejected");
      setRejectModal(null);
      setRejectReason("");
      fetchList(); fetchSummary();
    } catch (e: any) { notify(e.message || "Reject failed"); }
    finally { setRejectSubmitting(false); setActionBusy(null); }
  };
  const handleActivate = async (id: string) => {
    if (!accessToken) return;
    setActionBusy(id);
    try {
      await apiFetch(`/admin/organisations/${id}/status`, { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: "active" }) });
      notify("Activated");
      fetchList(); fetchSummary();
    } catch (e: any) { notify(e.message || "Activate failed"); }
    finally { setActionBusy(null); }
  };
  const handleDeactivate = (id: string) => {
    if (!accessToken) return;
    setConfirmState({
      title: "Deactivate organisation?",
      message: "The organisation will be marked disabled. You can reactivate it later.",
      run: async () => {
        setActionBusy(id);
        try {
          await apiFetch(`/admin/organisations/${id}/status`, { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ status: "disabled" }) });
          notify("Deactivated");
          fetchList(); fetchSummary();
        } catch (e: any) { notify(e.message || "Deactivate failed"); }
        finally { setActionBusy(null); }
      },
    });
  };
  const handleDelete = (id: string) => {
    if (!accessToken) return;
    setConfirmState({
      title: "Delete organisation permanently?",
      message: "This cannot be undone.",
      run: async () => {
        setActionBusy(id);
        try {
          await apiFetch(`/admin/organisations/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
          notify("Deleted");
          fetchList(); fetchSummary();
        } catch (e: any) { notify(e.message || "Delete failed"); }
        finally { setActionBusy(null); }
      },
    });
  };

  // Hard delete, not a status flip — see AdminOrganisationsService.deletePendingSignup
  // for why (a disabled row would permanently squat on that email/phone).
  const handleDeleteSignup = (row: PendingSignupRow) => {
    if (!accessToken) return;
    setConfirmState({
      title: "Delete this signup permanently?",
      message: `${row.email} will be removed entirely — they can sign up again with the same email or phone number afterwards. This cannot be undone.`,
      run: async () => {
        setDeletingSignupId(row.id);
        try {
          await apiFetch(`/admin/organisations/pending-signups/${row.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          notify("Deleted");
          setSignupDrawer(null);
          fetchPendingSignups();
          fetchSummary();
        } catch (e: any) {
          notify(e.message || "Delete failed");
        } finally {
          setDeletingSignupId(null);
        }
      },
    });
  };

  // Same handlers as before, just surfaced through the row's kebab menu
  // instead of a row of buttons — approve/reject/activate/deactivate/delete
  // behaviour is unchanged, only the presentation moved.
  const rowActionsFor = (o: OrganisationListRow): RowAction[] => {
    const rowBusy = actionBusy === o.id;
    // A draft never went through review — not a real org yet — so the
    // only thing worth doing here is deleting it (or reaching out using
    // the contact details already shown in the row).
    if (o.status === "draft") {
      return canDeleteOrganisations
        ? [{ key: "delete", label: "Delete", danger: true, onClick: () => handleDelete(o.id), disabled: rowBusy }]
        : [];
    }
    const actions: RowAction[] = [];
    if (o.status === "active" && canDeactivateOrganisations) {
      actions.push({ key: "deactivate", label: "Deactivate", onClick: () => handleDeactivate(o.id), disabled: rowBusy });
    } else if (o.status !== "active" && canActivateOrganisations) {
      actions.push({ key: "activate", label: "Activate", onClick: () => handleActivate(o.id), disabled: rowBusy });
    }
    if (canViewOrganisations) {
      actions.push({ key: "view", label: "View", onClick: () => router.push(`/admin-console/organisation-detail/${o.id}`) });
    }
    if (canDeleteOrganisations) {
      actions.push({ key: "delete", label: "Delete", danger: true, onClick: () => handleDelete(o.id), disabled: rowBusy });
    }
    return actions;
  };

  if (authLoading || !accessToken) {
    return null;
  }

  const isPendingSignupsView = statusFilter === PENDING_SIGNUPS_FILTER;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to = Math.min(page * LIMIT, total);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const signupRows = pendingSignupsResult?.data ?? [];
  const signupTotal = pendingSignupsResult?.total ?? 0;
  const signupFrom = signupTotal === 0 ? 0 : (page - 1) * LIMIT + 1;
  const signupTo = Math.min(page * LIMIT, signupTotal);
  const signupTotalPages = Math.max(1, Math.ceil(signupTotal / LIMIT));

  return (
    <>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 13,
          color: "#64748b",
          marginBottom: 16,
        }}
      >
        <Icon name="home" size={14} />
        <span>Platform</span>
        <span style={{ color: "#94a3b8" }}>›</span>
        <span style={{ color: "#0f172a", fontWeight: 600 }}>Organisations</span>
      </div>

      {/* Hero Header Banner */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef2f6",
          borderRadius: 18,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)",
              border: "1px solid #c7d2fe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4f46e5",
              flexShrink: 0,
            }}
          >
            <Icon name="building" size={26} />
          </div>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#0f172a",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Organisations
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                color: "#64748b",
                fontSize: 13.5,
                maxWidth: 700,
                lineHeight: 1.45,
              }}
            >
              Every developer, agency and brokerage on the iPixxel Realty platform. Direct creation, approve/reject, activate/deactivate/delete.
            </p>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatTile
          icon="building"
          iconBg="#eff6ff"
          iconColor="#2563eb"
          label="Total Organisations"
          value={summary ? <CountUp value={summary.total} /> : "—"}
          sub={<span style={{ color: "#10b981", fontWeight: 600 }}>↑ 12% from last month</span>}
        />
        <StatTile
          icon="users"
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Active"
          value={summary ? <CountUp value={summary.active} /> : "—"}
          accent="#10b981"
          sub={<span style={{ color: "#10b981", fontWeight: 600 }}>↑ 10% from last month</span>}
        />
        {/* Pending Approval tile hidden for now (not required).
        <StatTile
          icon="clock"
          iconBg="#fef3c7"
          iconColor="#d97706"
          label="Pending Approval"
          value={summary ? <CountUp value={summary.pending ?? 0} /> : "—"}
          accent={summary && (summary.pending ?? 0) > 0 ? "#f59e0b" : "#0f172a"}
          sub="Awaiting review"
        />
        */}
        <StatTile
          icon="shield"
          iconBg="#ffe4e6"
          iconColor="#e11d48"
          label="Rejected / Disabled"
          value={summary ? <CountUp value={summary.disabled ?? 0} /> : "—"}
          accent={summary && (summary.disabled ?? 0) > 0 ? "#f43f5e" : "#0f172a"}
          sub="Rejected + disabled orgs"
        />
        <StatTile
          icon="document"
          iconBg="#ede9fe"
          iconColor="#7c3aed"
          // Same count as the "Pending Signups" filter pill below.
          label="Pending Signups"
          value={summary ? <CountUp value={summary.pendingSignups ?? 0} /> : "—"}
          accent="#8b5cf6"
          sub="Signed up, onboarding incomplete"
        />

      </div>

      {/* Filter + search toolbar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {STATUS_PILLS.map((p) => {
            const active = statusFilter === p.value;
            const count =
              p.value === "all"
                ? summary?.total
                : p.value === "active"
                  ? summary?.active
                  : p.value === "pending"
                    ? summary?.pending
                    : p.value === "disabled"
                      ? summary?.disabled
                      : undefined;
            return (
              <button
                key={p.value}
                type="button"
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: active ? "1px solid #2563eb" : "1px solid #e2e8f0",
                  background: active ? "#2563eb" : "#ffffff",
                  color: active ? "#ffffff" : "#475569",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onClick={() => {
                  setStatusFilter(p.value);
                  setPage(1);
                }}
              >
                {p.label}{count !== undefined ? ` (${count})` : ""}
              </button>
            );
          })}
          <button
            type="button"
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              border: isPendingSignupsView ? "1px solid #2563eb" : "1px solid #e2e8f0",
              background: isPendingSignupsView ? "#2563eb" : "#ffffff",
              color: isPendingSignupsView ? "#ffffff" : "#475569",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onClick={() => {
              setStatusFilter(PENDING_SIGNUPS_FILTER);
              setPage(1);
            }}
          >
            Pending Signups ({summary?.pendingSignups ?? 0})
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: 260, maxWidth: 360 }}>
            <input
              className="inp"
              placeholder={isPendingSignupsView ? "Search by name, email or phone…" : "Search by name, city, domain, admin or email..."}
              style={{
                paddingLeft: 36,
                paddingRight: 14,
                height: 38,
                fontSize: 13,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                width: "100%",
              }}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
              <Icon name="search" size={15} />
            </span>
          </div>

          {/* Role (Organisation.industry) filter — organisations list only. */}
          {!isPendingSignupsView ? (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setRoleMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={roleMenuOpen}
                style={{
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: industryFilter ? "1px solid #2563eb" : "1px solid #e2e8f0",
                  background: industryFilter ? "#eff6ff" : "#ffffff",
                  color: industryFilter ? "#2563eb" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
                title="Filter by role"
              >
                <Icon name="filter" size={16} />
                {industryFilter ? <span>{industryShortLabel(industryFilter)}</span> : null}
              </button>
              {roleMenuOpen ? (
                <>
                  {/* Click-away backdrop */}
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setRoleMenuOpen(false)} />
                  <div
                    role="menu"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 44,
                      zIndex: 41,
                      minWidth: 200,
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      boxShadow: "0 12px 28px -12px rgba(15, 23, 42, 0.25)",
                      padding: 6,
                    }}
                  >
                    <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.04em" }}>
                      FILTER BY ROLE
                    </div>
                    {[{ value: "" as const, short: "All roles" }, ...INDUSTRY_OPTIONS].map((opt) => {
                      const selected = industryFilter === opt.value;
                      return (
                        <button
                          key={opt.value || "all"}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          onClick={() => {
                            setIndustryFilter(opt.value);
                            setPage(1);
                            setRoleMenuOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "8px 10px",
                            border: 0,
                            borderRadius: 8,
                            background: selected ? "#eff6ff" : "transparent",
                            color: selected ? "#2563eb" : "#334155",
                            fontSize: 13,
                            fontWeight: selected ? 700 : 500,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {opt.short}
                          {selected ? <Icon name="check" size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Table */}
      {isPendingSignupsView ? (
        <Reveal delay={3}>
          <div className="card">
            <div className="card-h">
              <span className="t">Pending Signups</span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {pendingSignupsLoading ? "Loading…" : `Showing ${signupFrom}–${signupTo} of ${signupTotal}`}
              </span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Step 1</th>
                    <th>Email verification</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Age</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSignupsError ? (
                    <tr>
                      <td colSpan={9} className="muted">{pendingSignupsError}</td>
                    </tr>
                  ) : !pendingSignupsLoading && signupRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="muted">No pending signups right now.</td>
                    </tr>
                  ) : (
                    signupRows.map((s) => {
                      const name = [s.firstName, s.lastName].filter(Boolean).join(" ") || "—";
                      return (
                        <tr key={s.id}>
                          <td>
                            <button
                              type="button"
                              className="u"
                              style={{ cursor: "pointer", background: "none", border: "none", padding: 0, textAlign: "left" }}
                              onClick={() => setSignupDrawer(s)}
                            >
                              <span className="av">{initials(name === "—" ? s.email : name)}</span>
                              <span>
                                <span className="nm">{name}</span>
                                <br />
                                <span className="sm">Signup draft</span>
                              </span>
                            </button>
                          </td>
                          <td>{s.email}</td>
                          <td>{s.phoneNumber ?? "—"}</td>
                          <td><span className="badge b-green">Complete</span></td>
                          <td><span className="badge b-green">Verified</span></td>
                          <td><span className="badge b-gray">Active · No organisation</span></td>
                          <td>{formatDate(s.createdAt)}</td>
                          <td>{daysAgo(s.createdAt)}</td>
                          <td>
                            <RowActionsMenu
                              actions={[
                                { key: "view", label: "View", onClick: () => setSignupDrawer(s) },
                                {
                                  key: "delete",
                                  label: "Delete",
                                  danger: true,
                                  onClick: () => handleDeleteSignup(s),
                                  disabled: deletingSignupId === s.id,
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {signupTotalPages > 1 ? (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 18px" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>
                  Page {page} of {signupTotalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={page >= signupTotalPages}
                  onClick={() => setPage((p) => Math.min(signupTotalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            ) : null}
          </div>
        </Reveal>
      ) : (
        <Reveal delay={3}>
          <div style={{ background: "#ffffff", border: "1px solid #eef2f6", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.02)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4f46e5" }}>
                  <Icon name="building" size={16} />
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Organisation Catalogue</span>
              </div>
              <span style={{ fontSize: 12.5, color: "#64748b" }}>
                {loading ? "Loading…" : `Showing ${from} – ${to} of ${total} organisations`}
              </span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>#</th>
                    <th>ORGANISATION</th>
                    <th>DOMAIN</th>
                    <th>ADMIN</th>
                    <th>ROLE</th>
                    <th>PLAN</th>
                    <th>USERS</th>
                    <th>TEMPLATES</th>
                    <th>MRR</th>
                    <th>STATUS</th>
                    <th>JOINED</th>
                    <th style={{ textAlign: "right", paddingRight: 24 }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {error ? (
                    <tr>
                      <td colSpan={12} className="muted">
                        {error}
                      </td>
                    </tr>
                  ) : !loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="muted">
                        No organisations match this filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((o, idx) => {
                      const avatarColors = ["#2563eb", "#0284c7", "#0d9488", "#059669", "#ea580c", "#7c3aed", "#db2777"];
                      const avColor = avatarColors[idx % avatarColors.length];
                      const rowNumber = (page - 1) * LIMIT + idx + 1;
                      return (
                        <tr key={o.id}>
                          <td style={{ textAlign: "center", color: "#64748b", fontWeight: 600, fontSize: 12.5 }}>
                            {rowNumber}
                          </td>
                          <td>
                            {o.status === "draft" ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 10,
                                    background: avColor,
                                    color: "#ffffff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 700,
                                    fontSize: 14,
                                    flexShrink: 0,
                                  }}
                                >
                                  {initials(o.name)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>{o.name}</div>
                                  <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                    <Icon name="pin" size={11} /> {o.city || "Bengaluru"}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <Link href={`/admin-console/organisation-detail/${o.id}`} style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                                <div
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: 10,
                                    background: avColor,
                                    color: "#ffffff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 700,
                                    fontSize: 14,
                                    flexShrink: 0,
                                  }}
                                >
                                  {initials(o.name)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>{o.name}</div>
                                  <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                    <Icon name="pin" size={11} /> {o.city || "Bengaluru"}
                                  </div>
                                </div>
                              </Link>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#475569" }}>
                                <Icon name="globe" size={12} style={{ color: "#94a3b8" }} />
                                <span>{o.subdomainHost || o.subdomain || o.customDomain || "—"}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                                <span style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>active</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{o.adminName ?? "—"}</span>
                              <span style={{ fontSize: 12, color: "#64748b" }}>{o.adminEmail ?? "—"}</span>
                              {o.adminPhone ? <span style={{ fontSize: 11.5, color: "#94a3b8" }}>{o.adminPhone}</span> : null}
                            </div>
                          </td>
                          {/* Organisation.industry — chosen at signup, editable in Settings / Edit. */}
                          <td style={{ whiteSpace: "nowrap" }}>
                            {o.industry ? (
                              <span className="chip" style={{ fontSize: 12 }}>{industryShortLabel(o.industry)}</span>
                            ) : (
                              <span style={{ fontSize: 12.5, color: "#94a3b8" }}>—</span>
                            )}
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 600,
                                background: "#eff6ff",
                                color: "#2563eb",
                                border: "1px solid #dbeafe",
                              }}
                            >
                              {o.plan?.name || "Basic"}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                              {o.teamCount || 1} team{(o.teamCount || 1) > 1 ? "s" : ""}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                              {o.templatesCount ?? 0}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                              {o.mrr ? `₹${o.mrr.toLocaleString("en-IN")}` : "—"}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: o.status === "active" ? "#10b981" : o.status === "disabled" || o.status === "rejected" ? "#ef4444" : "#f59e0b",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  color: o.status === "active" ? "#10b981" : o.status === "disabled" || o.status === "rejected" ? "#ef4444" : "#f59e0b",
                                  textTransform: "capitalize",
                                }}
                              >
                                {o.status === "disabled" ? "Disabled" : o.status === "rejected" ? "Rejected" : o.status === "active" ? "Active" : o.status === "draft" ? "Draft" : "Pending"}
                              </span>
                              {o.status === "rejected" && o.rejectionReason ? (
                                <ReasonInfoPopover reason={o.rejectionReason} />
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: 12.5, color: "#475569" }}>
                              {formatDate(o.createdAt)}
                            </span>
                          </td>
                          <td style={{ textAlign: "right", paddingRight: 24 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <RowActionsMenu actions={rowActionsFor(o)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 18px", borderTop: "1px solid #f1f5f9" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            ) : null}
          </div>
        </Reveal>
      )}
      {toast ? <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}><div className="card" style={{ padding: "12px 16px", boxShadow: "var(--sh-lg)" }}>{toast}</div></div> : null}
      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        message={confirmState?.message}
        confirmLabel="Confirm"
        destructive
        busy={confirmBusy}
        onConfirm={async () => {
          if (!confirmState) return;
          setConfirmBusy(true);
          try {
            await confirmState.run();
          } finally {
            setConfirmBusy(false);
            setConfirmState(null);
          }
        }}
        onClose={() => setConfirmState(null)}
      />
      <Modal
        open={!!rejectModal}
        onClose={() => {
          if (!rejectSubmitting) { setRejectModal(null); setRejectReason(""); setRejectError(null); }
        }}
        title="Reject organisation?"
        description={
          rejectModal ? (
            <>
              <strong>&quot;{rejectModal.name}&quot;</strong> will be marked rejected. A reason is required
              — it&apos;s saved with the organisation and shown to super admins on the organisations list.
            </>
          ) : undefined
        }
        closeDisabled={rejectSubmitting}
        footer={
          <>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => { setRejectModal(null); setRejectReason(""); setRejectError(null); }}
              disabled={rejectSubmitting}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => void submitReject()}
              disabled={rejectSubmitting}
            >
              {rejectSubmitting ? "Rejecting…" : "Reject organisation"}
            </button>
          </>
        }
      >
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
          Rejection reason <span style={{ color: "var(--rose)" }}>*</span>
        </label>
        <textarea
          style={{ minHeight: 90, resize: "vertical", ...(rejectError ? { borderColor: "var(--rose)" } : {}) }}
          placeholder="Why is this organisation being rejected?"
          value={rejectReason}
          onChange={(e) => {
            setRejectReason(e.target.value);
            if (rejectError) setRejectError(null);
          }}
          disabled={rejectSubmitting}
          autoFocus
          maxLength={500}
          aria-invalid={rejectError ? true : undefined}
        />
        <div style={{ marginTop: 6, fontSize: 11.5, color: rejectError ? "var(--rose)" : "var(--faint)", fontWeight: rejectError ? 600 : 400 }}>
          {rejectError ?? `${rejectReason.length}/500`}
        </div>
      </Modal>

      {/* Pending signup detail drawer — account info + onboarding state
          only. No password field anywhere: there is nothing to show (it's
          a hash) and nothing here should ever let a Super Admin set one on
          someone else's still-forming account. */}
      <Modal
        open={!!signupDrawer}
        onClose={() => setSignupDrawer(null)}
        title="Signup draft"
        description={signupDrawer ? signupDrawer.email : undefined}
        size="sm"
        footer={
          signupDrawer ? (
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => handleDeleteSignup(signupDrawer)}
              disabled={deletingSignupId === signupDrawer.id}
            >
              {deletingSignupId === signupDrawer.id ? "Deleting…" : "Delete signup"}
            </button>
          ) : undefined
        }
      >
        {signupDrawer ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Name</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {[signupDrawer.firstName, signupDrawer.lastName].filter(Boolean).join(" ") || "—"}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Email</div>
              <div style={{ fontSize: 13.5 }}>{signupDrawer.email}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Phone</div>
              <div style={{ fontSize: 13.5 }}>{signupDrawer.phoneNumber ?? "—"}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Country</div>
              <div style={{ fontSize: 13.5 }}>{signupDrawer.country ?? "—"}</div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Step 1</div>
                <span className="badge b-green">Complete</span>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Email verification</div>
                <span className="badge b-green">Verified</span>
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Status</div>
              <span className="badge b-gray">Active · No organisation</span>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Created</div>
                <div style={{ fontSize: 13 }}>{formatDate(signupDrawer.createdAt)}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Age</div>
                <div style={{ fontSize: 13 }}>{daysAgo(signupDrawer.createdAt)}</div>
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Verified</div>
              <div style={{ fontSize: 13 }}>{formatDate(signupDrawer.emailVerifiedAt)}</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}