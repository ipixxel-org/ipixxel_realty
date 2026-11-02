"use client";

import { useEffect, useState, type ReactNode } from "react";
import { readListQuery, replaceListQuery } from "@/app/admin-console/subscriptions/subscriptions-shared";
import { Icon } from "@/components/icons";
import { ListPager } from "@/components/ui/list-pager";
import { useToast } from "@/components/ui/toast";
import { addDays, describeCoupon, formatDate, formatINR } from "@/lib/billing/pricing";
import type { SubscriptionDetail, SubscriptionRow, SubscriptionStatus, TimelineEvent } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { BillingDialog, DialogActions } from "../dialog";
import { BLink, Empty, ErrorNote, Kv, Loading, PAYMENT_STATUS_META, Section, STATUS_META } from "../ui";
import { OrderIdCell, PaymentDocuments } from "./payment-cells";
import { PlanVersionHistoryDialog } from "./plan-version-history";

const ADMIN_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ...Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.label])),
  free: "Free (Basic)",
  renewal_due: "Renewing soon",
  past_due: "Payment due · grace",
} as Record<SubscriptionStatus, string>;

const DATE_LABEL: Record<SubscriptionStatus, string> = {
  free: "—",
  active: "Renews",
  renewal_due: "Renews",
  past_due: "Grace ends",
  grace_ending: "Grace ends",
  expired: "Expired on",
  moved_to_basic: "Moved on",
  cancellation_scheduled: "Ends",
  downgrade_scheduled: "Downgrades",
};

const TIMELINE_COLOR: Record<TimelineEvent["kind"], string> = {
  bought: "var(--green)",
  renewed: "var(--green)",
  payment_failed: "var(--rose)",
  grace: "var(--amber)",
  moved_to_basic: "var(--muted)",
  coupon: "var(--violet)",
  plan_change: "var(--brand)",
  cancel: "var(--amber)",
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "+3 days" next to the status while grace has been extended by Super Admin. */
function GraceExtraTag({ days }: { days?: number }) {
  if (!days || days <= 0) return null;
  return (
    <span className="badge b-amber" style={{ marginLeft: 6 }} title={`Grace extended by ${plural(days, "day")}`} data-testid="grace-extra-tag">
      +{plural(days, "day")}
    </span>
  );
}

/** "Starter v2" — the plan with the version the organisation is on. */
export function planWithVersion(r: Pick<SubscriptionRow, "plan" | "planVersion">): string {
  return r.planVersion ? `${r.plan.name} v${r.planVersion}` : r.plan.name;
}

/** "v3 applies at renewal on 26 Nov 2026" (Basic: "v3 applies on …"); null when on the newest. */
export function newerVersionNote(r: Pick<SubscriptionRow, "plan" | "latestVersion" | "versionAppliesOn">): string | null {
  if (!r.latestVersion || !r.versionAppliesOn) return null;
  return `v${r.latestVersion} applies ${r.plan.isFree ? "on" : "at renewal on"} ${formatDate(r.versionAppliesOn)}`;
}

function NewerVersionNote({ row }: { row: SubscriptionRow }) {
  const note = newerVersionNote(row);
  return note ? (
    <div className="bl-muted bl-small" data-testid="newer-version-note" title="A newer version of this plan: the organisation keeps its version until then">
      {note}
    </div>
  ) : null;
}

/** "View" next to "Starter v1": that version's prices, limits and features. */
function ViewVersion({ row }: { row: SubscriptionRow }) {
  const [open, setOpen] = useState(false);
  if (!row.planVersionId) return null;
  return (
    <>
      {" "}
      <button
        type="button"
        data-testid="view-plan-version"
        onClick={() => setOpen(true)}
        style={{ background: "none", border: 0, padding: 0, color: "var(--brand)", cursor: "pointer", fontWeight: 600, fontSize: 12.5 }}
      >
        View
      </button>
      <PlanVersionHistoryDialog
        open={open}
        onClose={() => setOpen(false)}
        planId={row.plan.id}
        planName={row.plan.name}
        onlyVersionId={row.planVersionId}
        title={planWithVersion(row)}
      />
    </>
  );
}

/** Extend grace: whole days, 1–60 per extension (the backend's ExtendGraceDto limit). */
export const GRACE_EXTEND_MAX = 60;

export function graceDaysError(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return "Enter the number of extra days.";
  if (!/^\d+$/.test(v)) return "Whole days only (no decimals).";
  const n = Number(v);
  if (n < 1) return "At least 1 day.";
  if (n > GRACE_EXTEND_MAX) return `At most ${GRACE_EXTEND_MAX} days at a time.`;
  return null;
}

/**
 * Grace end after adding `more` days — the backend's graceEndFor: due date +
 * grace days + every extra day (earlier ones and these). Without a due date,
 * the current end + the new days (the same date).
 */
export function graceEndAfter(d: Pick<SubscriptionDetail, "dueDate" | "graceDays" | "graceExtraDays" | "keyDate">, more: number): string | null {
  if (d.dueDate) return addDays(d.dueDate, d.graceDays + (d.graceExtraDays ?? 0) + more);
  return d.keyDate ? addDays(d.keyDate, more) : null;
}

const ALL: SubscriptionStatus[] =["free", "active", "renewal_due", "past_due", "grace_ending", "expired", "moved_to_basic", "cancellation_scheduled", "downgrade_scheduled"];

/* ------------------------------------------------------------------- List */

/**
 * `syncUrl` (the Subscriptions studio tab): the status / plan / search / page
 * live in the URL (?tab=org-subscriptions&status=…&plan=…&q=…&page=…), so a
 * reload or Back from an org page restores them.
 */
export function SubscriptionsList({ syncUrl = false }: { syncUrl?: boolean } = {}) {
  const initial = (key: string) => (syncUrl ? (readListQuery().get(key) ?? "") : "");
  const [status, setStatus] = useState<SubscriptionStatus | "">(() => {
    const s = initial("status");
    return (ALL as string[]).includes(s) ? (s as SubscriptionStatus) : "";
  });
  const [planId, setPlanId] = useState(() => initial("plan"));
  const [q, setQ] = useState(() => initial("q"));
  const [page, setPage] = useState(() => Math.max(1, Number(initial("page")) || 1));
  const listState = { status, plan: planId, q, page };
  useEffect(() => {
    if (syncUrl) replaceListQuery({ tab: "org-subscriptions", status, plan: planId, q, page });
  }, [syncUrl, status, planId, q, page]);
  const { data: plans } = useBillingQuery((c) => c.listAdminPlans(), []);
  const { data, error } = useBillingQuery((c) => c.listSubscriptions({ status: status || undefined, planId: planId || undefined, q, page, pageSize: 10 }), [status, planId, q, page]);
  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };
  if (error) return <ErrorNote message={error} />;
  return (
    <div className="bl-stack">
      <div className="bl-row" style={{ gap: 8 }}>
        {ALL.map((s) => (
          <button
            key={s}
            type="button"
            className={`badge ${STATUS_META[s].badge}`}
            style={{ border: status === s ? "1px solid currentColor" : "1px solid transparent", cursor: "pointer" }}
            onClick={() => filter(() => setStatus(status === s ? "" : s))}
          >
            {ADMIN_STATUS_LABEL[s]} · {data ? (data.countsByStatus[s] ?? 0) : "…"}
          </button>
        ))}
      </div>
      <div className="bl-row">
        <input className="inp" style={{ maxWidth: 240 }} placeholder="Search organisations…" value={q} onChange={(e) => filter(() => setQ(e.target.value))} />
        <select className="inp" style={{ maxWidth: 220 }} value={status} onChange={(e) => filter(() => setStatus(e.target.value as SubscriptionStatus | ""))} aria-label="Filter by status">
          <option value="">All statuses</option>
          {ALL.map((s) => (
            <option key={s} value={s}>
              {ADMIN_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="inp" style={{ maxWidth: 200 }} value={planId} onChange={(e) => filter(() => setPlanId(e.target.value))} aria-label="Filter by plan">
          <option value="">All plans</option>
          {(plans ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <Section title={data ? `${data.total} organisation${data.total === 1 ? "" : "s"}` : "Organisations"} flush>
        {!data ? (
          <Loading what="subscriptions" />
        ) : data.total === 0 ? (
          <Empty>No organisations match these filters.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Renewal</th>
                  <th>Key date</th>
                  <th>Users</th>
                  <th>Coupon</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((o) => (
                  <tr key={o.orgId}>
                    <td>
                      <b>{o.orgName}</b>
                      <div className="bl-muted bl-small">
                        {o.city}, {o.state}
                      </div>
                    </td>
                    <td>
                      <span data-testid="row-plan">{planWithVersion(o)}</span>
                      {!o.plan.isFree ? <div className="bl-muted bl-small">{o.interval}</div> : null}
                      <NewerVersionNote row={o} />
                    </td>
                    <td>
                      <span className={`badge ${STATUS_META[o.status].badge}`}>{ADMIN_STATUS_LABEL[o.status]}</span>
                      <GraceExtraTag days={o.graceExtraDays} />
                    </td>
                    <td>{o.status === "free" ? "—" : o.renewalMode === "auto" ? "Automatic" : "Pay each time"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {o.keyDate ? (
                        <>
                          <span className="bl-muted bl-small">{DATE_LABEL[o.status]} </span>
                          {formatDate(o.keyDate)}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{o.users}</td>
                    <td>{o.couponCode ? <span className="badge b-violet">{o.couponCode}</span> : <span className="bl-muted">—</span>}</td>
                    <td>
                      <BLink to="adminSubscription" params={{ orgId: o.orgId, ...(syncUrl ? { from: "org-subscriptions", ...listState } : {}) }} className="btn btn-ghost btn-sm">
                        Open
                      </BLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {data ? <ListPager page={page} total={data.total} onPageChange={setPage} noun="organisations" /> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Detail */

export type SubscriptionAction = "grace" | "offline" | "coupon" | "cancel";

export function SubscriptionTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ul className="bl-timeline">
      {[...events].reverse().map((e, i) => (
        <li key={`${e.at}-${i}`}>
          <span className="bl-dot" style={{ background: TIMELINE_COLOR[e.kind] }} />
          <time>{formatDate(e.at)}</time>
          {e.text}
        </li>
      ))}
    </ul>
  );
}

function ActionDialog({
  action,
  detail,
  onClose,
  onDone,
}: {
  action: SubscriptionAction | null;
  detail: SubscriptionDetail;
  onClose: () => void;
  onDone: (d: SubscriptionDetail, message: string) => void;
}) {
  const { client } = useBillingEnv();
  const { toast } = useToast();
  const { data: coupons } = useBillingQuery((c) => c.listCoupons(), []);
  const today = new Date().toISOString().slice(0, 10);
  const [graceRaw, setGraceRaw] = useState("3");
  const graceError = graceDaysError(graceRaw);
  const graceDays = graceError ? 0 : Number(graceRaw.trim());
  const extraBefore = detail.graceExtraDays ?? 0;
  const newGraceEnd = graceError ? null : graceEndAfter(detail, graceDays);
  const [note, setNote] = useState("");
  const [offline, setOffline] = useState({ amount: String(detail.renewalAmount), method: "NEFT / RTGS", reference: "", date: today });
  const [code, setCode] = useState("");
  const [when, setWhen] = useState<"period_end" | "now">("period_end");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (action === "grace") {
        const d = await client.extendGrace({ orgId: detail.orgId, days: graceDays, note: note || undefined });
        onDone(d, `${detail.orgName} now has until ${d.keyDate ? formatDate(d.keyDate) : "later"}.`);
      } else if (action === "offline") {
        const d = await client.markPaidOffline({ orgId: detail.orgId, amount: Number(offline.amount) || 0, method: offline.method, reference: offline.reference, receivedOn: offline.date });
        onDone(d, `${detail.orgName} is active until ${d.keyDate ? formatDate(d.keyDate) : "the next renewal"}. An invoice is issued.`);
      } else if (action === "coupon") {
        const d = await client.applyCoupon({ orgId: detail.orgId, code });
        onDone(d, `${code} will reduce ${detail.orgName}'s next payment.`);
      } else if (action === "cancel") {
        const d = await client.cancelSubscription({ orgId: detail.orgId, when, note: note || undefined });
        onDone(d, when === "now" ? `${detail.orgName} moved to Basic.` : `Move to Basic scheduled${detail.keyDate ? ` for ${formatDate(detail.keyDate)}` : ""}.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast({ variant: "error", title: "Couldn't do that", description: msg });
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<SubscriptionAction, string> = {
    grace: "Give more time to pay",
    offline: "Mark as paid offline",
    coupon: "Apply a coupon",
    cancel: `Move ${detail.orgName} to Basic`,
  };
  const confirmLabel: Record<SubscriptionAction, string> = {
    grace: graceError ? "Extend grace" : `Extend by ${plural(graceDays, "day")}`,
    offline: "Mark as paid",
    coupon: "Apply",
    cancel: "Move to Basic",
  };

  return (
    <BillingDialog
      open={action !== null}
      onClose={onClose}
      title={action ? titles[action] : ""}
      footer={
        <DialogActions>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Back
          </button>
          <button type="button" className={`btn btn-sm ${action === "cancel" ? "btn-danger" : "btn-primary"}`} disabled={busy || (action === "coupon" && !code) || (action === "grace" && !!graceError)} onClick={() => void confirm()}>
            {action ? confirmLabel[action] : ""}
          </button>
        </DialogActions>
      }
    >
      <div className="bl-stack" style={{ gap: 12 }}>
        {action === "grace" ? (
          <>
            <div className="bl-muted" data-testid="grace-intro">
              Grace currently ends {detail.keyDate ? formatDate(detail.keyDate) : "—"}
              {extraBefore > 0 ? ` (includes ${plural(extraBefore, "extra day")} given earlier). The new days are added on top` : ""}. Everything keeps working until the new
              date.
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="bl-grace-days">Extra days</label>
              <input
                id="bl-grace-days"
                className="inp"
                type="number"
                inputMode="numeric"
                min={1}
                max={GRACE_EXTEND_MAX}
                step={1}
                style={{ maxWidth: 140 }}
                value={graceRaw}
                aria-invalid={!!graceError}
                aria-describedby="bl-grace-days-help"
                onChange={(e) => setGraceRaw(e.target.value)}
              />
              <div id="bl-grace-days-help" style={{ marginTop: 6 }}>
                {graceError ? (
                  <div className="bl-coupon-err" data-testid="grace-days-error">
                    ✕ {graceError}
                  </div>
                ) : (
                  <div className="hint" data-testid="grace-new-end">
                    Grace will end on {newGraceEnd ? formatDate(newGraceEnd) : "—"} (currently {detail.keyDate ? formatDate(detail.keyDate) : "—"})
                  </div>
                )}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Note (optional)</label>
              <input className="inp" value={note} placeholder="Customer promised a bank transfer by Friday" onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        ) : null}
        {action === "offline" ? (
          <>
            <div className="row2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Amount received (₹ incl. GST)</label>
                <input className="inp" type="number" value={offline.amount} onChange={(e) => setOffline((o) => ({ ...o, amount: e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Received on</label>
                <input className="inp" type="date" value={offline.date} onChange={(e) => setOffline((o) => ({ ...o, date: e.target.value }))} />
              </div>
            </div>
            <div className="row2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>How</label>
                <select className="inp" value={offline.method} onChange={(e) => setOffline((o) => ({ ...o, method: e.target.value }))}>
                  <option>NEFT / RTGS</option>
                  <option>Cheque</option>
                  <option>UPI (outside Razorpay)</option>
                  <option>Cash</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Reference / UTR</label>
                <input className="inp" value={offline.reference} placeholder="SBIN0261008" onChange={(e) => setOffline((o) => ({ ...o, reference: e.target.value }))} />
              </div>
            </div>
            <div className="hint">Starts a new {detail.interval} period from the received date and issues a GST invoice.</div>
          </>
        ) : null}
        {action === "coupon" ? (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Coupon</label>
            <select className="inp" value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">Choose a coupon…</option>
              {(coupons ?? []).map(({ coupon }) => (
                <option key={coupon.code} value={coupon.code}>
                  {coupon.code} — {describeCoupon(coupon)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {action === "cancel" ? (
          <>
            {(
              [
                ["period_end", `At the end of the period${detail.keyDate ? ` (${formatDate(detail.keyDate)})` : ""} — keeps ${detail.plan.name} until then`],
                ["now", "Straight away — moves to Basic now (no automatic refund)"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="bl-row" style={{ gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="radio" name="bl-cancel" checked={when === v} onChange={() => setWhen(v)} />
                {l}
              </label>
            ))}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Reason (internal)</label>
              <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        ) : null}
        {error ? <div className="bl-coupon-err">✕ {error}</div> : null}
      </div>
    </BillingDialog>
  );
}

/**
 * One organisation's billing, top to bottom: the action row, the plan
 * summary, `children` (Package requests on the org page), Payments, then the
 * Timeline and Coupon in use. `actions` adds buttons to the action row.
 * A new `version` reloads it (after a request is approved, …).
 */
export function SubscriptionDetailView({
  orgId,
  initialAction = null,
  version = 0,
  actions,
  children,
}: {
  orgId: string;
  initialAction?: SubscriptionAction | null;
  version?: number;
  actions?: (d: SubscriptionDetail) => ReactNode;
  children?: ReactNode;
}) {
  const { canEdit } = useBillingEnv();
  const { toast } = useToast();
  const { data, error } = useBillingQuery((c) => c.getSubscription(orgId), [orgId, version]);
  // An action's result, until the next reload.
  const [override, setOverride] = useState<{ version: number; detail: SubscriptionDetail } | null>(null);
  const [action, setAction] = useState<SubscriptionAction | null>(initialAction);
  if (error) return <ErrorNote message={error} />;
  const d = (override?.version === version ? override.detail : null) ?? data;
  if (!d) return <Loading what="subscription" />;
  const inGrace = d.status === "past_due" || d.status === "grace_ending";
  const extra = d.graceExtraDays ?? 0;
  const paid = !d.plan.isFree;
  // Manual mode: payments and coupons go through the org's request (Package
  // requests → Mark as paid), so those two actions aren't offered here.
  const viaRequest = (a: SubscriptionAction) => d.paymentMode === "manual" && (a === "offline" || a === "coupon");
  // Why each action is unavailable (null = available). Shown as the hover text.
  const noEdit = canEdit ? null : "You don't have permission to change billing";
  const onBasic = `Not available on ${d.plan.name} — the organisation isn't on a paid plan`;
  const blocked: Record<SubscriptionAction, string | null> = {
    grace: noEdit ?? (inGrace ? null : "Only for an organisation in its grace period (payment due after the renewal date)"),
    offline: noEdit ?? (paid ? null : onBasic),
    coupon: noEdit ?? (paid ? null : onBasic),
    cancel: noEdit ?? (!paid ? onBasic : d.status === "cancellation_scheduled" ? "A move to Basic is already scheduled" : null),
  };
  const actionButton = (a: SubscriptionAction, className: string, label: React.ReactNode) =>
    viaRequest(a) ? null : (
      // The wrapper carries the hover text: browsers don't reliably show a disabled button's title.
      <span title={blocked[a] ?? undefined} style={{ display: "inline-flex" }}>
        <button type="button" className={className} disabled={blocked[a] !== null} onClick={() => setAction(a)}>
          {label}
        </button>
      </span>
    );

  return (
    <div className="bl-stack">
      <div className="bl-row" data-testid="subscription-actions">
        {actionButton("grace", "btn btn-ghost", <><Icon name="clock" size={15} /> Extend grace</>)}
        {/* Hidden for now in online mode too (manual mode never shows them: viaRequest).
            The dialogs and endpoints are kept; uncomment to bring them back.
        {actionButton("offline", "btn btn-ghost", <><Icon name="check" size={15} /> Mark paid offline</>)}
        {actionButton("coupon", "btn btn-ghost", <><Icon name="tag" size={15} /> Apply coupon</>)}
        */}
        {actionButton("cancel", "btn btn-danger", "Move to Basic")}
        {actions?.(d)}
      </div>
      <Section title={d.orgName} sub={`${d.city}, ${d.state} · ${d.users} users`}>
        <div className="bl-grid4">
          <Kv label="Plan">
            <span data-testid="summary-plan">{planWithVersion(d)}</span>
            {paid ? <span className="bl-muted" style={{ fontWeight: 500 }}> · {d.interval}</span> : null}
            <ViewVersion row={d} />
            <NewerVersionNote row={d} />
          </Kv>
          <Kv label="Status">
            <span className={`badge ${STATUS_META[d.status].badge}`}>{ADMIN_STATUS_LABEL[d.status]}</span>
          </Kv>
          <Kv label={DATE_LABEL[d.status] === "—" ? "Key date" : DATE_LABEL[d.status]}>
            <span data-testid="summary-key-date">{d.keyDate ? formatDate(d.keyDate) : "—"}</span>
            {inGrace && extra > 0 ? (
              <div className="bl-muted bl-small" style={{ fontWeight: 500, marginTop: 2 }} data-testid="summary-grace-extra">
                {plural(d.graceDays, "day")} + {plural(extra, "extra day")}
              </div>
            ) : null}
          </Kv>
          <Kv label="Renewal">{!paid ? "—" : d.renewalMode === "auto" ? "Automatic (saved card / UPI)" : "Pay each time"}</Kv>
        </div>
        {paid ? (
          <div className="bl-muted" style={{ marginTop: 12 }}>
            Next charge {formatINR(d.renewalAmount)} incl. GST. Grace period {plural(d.graceDays, "day")}
            {inGrace && extra > 0 ? ` + ${plural(extra, "extra day")} given` : ""}.
          </div>
        ) : null}
      </Section>
      {children}
      <Section title="Payments" flush>
        {d.payments.length === 0 ? (
          <Empty>No payments — this organisation has only used the free plan.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>For</th>
                  <th>Order ID</th>
                  <th>Method</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.createdAt)}</td>
                    <td>{p.description}</td>
                    <td>
                      <OrderIdCell payment={p} />
                    </td>
                    <td>{p.method}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(p.amount)}</td>
                    <td>
                      <span className={`badge ${PAYMENT_STATUS_META[p.status].badge}`}>{PAYMENT_STATUS_META[p.status].label}</span>
                      {p.failureReason ? <div style={{ fontSize: 11, color: "var(--rose)", marginTop: 3 }}>{p.failureReason}</div> : null}
                    </td>
                    <td>
                      <PaymentDocuments payment={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <div className="bl-split">
        <Section title="Timeline" sub="Bought, renewed, missed payments, grace, moved to Basic">
          <SubscriptionTimeline events={d.timeline} />
        </Section>
        <Section title="Coupon in use">
          {d.coupon ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div className="bl-row" style={{ gap: 8 }}>
                <span className="badge b-violet bl-mono">{d.coupon.coupon.code}</span>
                <BLink to="adminCoupon" params={{ code: d.coupon.coupon.code }} className="bl-muted">
                  Usage →
                </BLink>
              </div>
              <div style={{ fontSize: 13 }}>{describeCoupon(d.coupon.coupon)}</div>
              <div className="bl-muted">{d.coupon.coupon.description}</div>
            </div>
          ) : (
            <div className="bl-muted">No coupon on this subscription.</div>
          )}
        </Section>
      </div>
      <ActionDialog
        key={action ?? "none"}
        action={action && !viaRequest(action) ? action : null}
        detail={d}
        onClose={() => setAction(null)}
        onDone={(next, message) => {
          setOverride({ version, detail: next });
          setAction(null);
          toast({ variant: "success", title: "Done", description: message });
        }}
      />
    </div>
  );
}
