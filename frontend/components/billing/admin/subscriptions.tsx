"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { ListPager } from "@/components/ui/list-pager";
import { useToast } from "@/components/ui/toast";
import { addDays, describeCoupon, formatDate, formatINR } from "@/lib/billing/pricing";
import type { SubscriptionDetail, SubscriptionStatus, TimelineEvent } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { BillingDialog, DialogActions } from "../dialog";
import { BLink, Empty, ErrorNote, Kv, Loading, PAYMENT_STATUS_META, Section, STATUS_META } from "../ui";
import { OrderIdCell, PaymentDocuments } from "./payment-cells";

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

const ALL: SubscriptionStatus[] = ["free", "active", "renewal_due", "past_due", "grace_ending", "expired", "moved_to_basic", "cancellation_scheduled", "downgrade_scheduled"];

/* ------------------------------------------------------------------- List */

export function SubscriptionsList() {
  const [status, setStatus] = useState<SubscriptionStatus | "">("");
  const [planId, setPlanId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
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
                      {o.plan.name}
                      {!o.plan.isFree ? <div className="bl-muted bl-small">{o.interval}</div> : null}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_META[o.status].badge}`}>{ADMIN_STATUS_LABEL[o.status]}</span>
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
                      <BLink to="adminSubscription" params={{ orgId: o.orgId }} className="btn btn-ghost btn-sm">
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
  const [graceDays, setGraceDays] = useState(3);
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
        onDone(d, when === "now" ? `${detail.orgName} moved to Basic.` : "Cancellation scheduled.");
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
    cancel: `Cancel ${detail.orgName}'s ${detail.plan.name} plan`,
  };
  const confirmLabel: Record<SubscriptionAction, string> = {
    grace: `Extend by ${graceDays} days`,
    offline: "Mark as paid",
    coupon: "Apply",
    cancel: "Cancel plan",
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
          <button type="button" className={`btn btn-sm ${action === "cancel" ? "btn-danger" : "btn-primary"}`} disabled={busy || (action === "coupon" && !code)} onClick={() => void confirm()}>
            {action ? confirmLabel[action] : ""}
          </button>
        </DialogActions>
      }
    >
      <div className="bl-stack" style={{ gap: 12 }}>
        {action === "grace" ? (
          <>
            <div className="bl-muted">Grace currently ends {detail.keyDate ? formatDate(detail.keyDate) : "—"}. Everything keeps working until the new date.</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Extra days</label>
              <select className="inp" value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))}>
                {[1, 3, 5, 7, 14].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? "" : "s"} → {detail.keyDate ? formatDate(addDays(detail.keyDate, d)) : ""}
                  </option>
                ))}
              </select>
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
                ["period_end", `At the end of the period${detail.keyDate ? ` (${formatDate(detail.keyDate)})` : ""} — access continues until then`],
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

export function SubscriptionDetailView({ orgId, initialAction = null }: { orgId: string; initialAction?: SubscriptionAction | null }) {
  const { canEdit } = useBillingEnv();
  const { toast } = useToast();
  const { data, error } = useBillingQuery((c) => c.getSubscription(orgId), [orgId]);
  const [override, setOverride] = useState<SubscriptionDetail | null>(null);
  const [action, setAction] = useState<SubscriptionAction | null>(initialAction);
  if (error) return <ErrorNote message={error} />;
  const d = override ?? data;
  if (!d) return <Loading what="subscription" />;
  const inGrace = d.status === "past_due" || d.status === "grace_ending";
  const paid = !d.plan.isFree;
  // Why each action is unavailable (null = available). Shown as the hover text.
  const noEdit = canEdit ? null : "You don't have permission to change billing";
  const onBasic = `Not available on ${d.plan.name} — the organisation isn't on a paid plan`;
  const blocked: Record<SubscriptionAction, string | null> = {
    grace: noEdit ?? (inGrace ? null : "Only for an organisation in its grace period (payment due after the renewal date)"),
    offline: noEdit ?? (paid ? null : onBasic),
    coupon: noEdit ?? (paid ? null : onBasic),
    cancel: noEdit ?? (!paid ? onBasic : d.status === "cancellation_scheduled" ? "Cancellation is already scheduled" : null),
  };
  const actionButton = (a: SubscriptionAction, className: string, label: React.ReactNode) => (
    // The wrapper carries the hover text: browsers don't reliably show a disabled button's title.
    <span title={blocked[a] ?? undefined} style={{ display: "inline-flex" }}>
      <button type="button" className={className} disabled={blocked[a] !== null} onClick={() => setAction(a)}>
        {label}
      </button>
    </span>
  );

  return (
    <div className="bl-stack">
      <div className="bl-row">
        {actionButton("grace", "btn btn-ghost", <><Icon name="clock" size={15} /> Extend grace</>)}
        {actionButton("offline", "btn btn-ghost", <><Icon name="check" size={15} /> Mark paid offline</>)}
        {actionButton("coupon", "btn btn-ghost", <><Icon name="tag" size={15} /> Apply coupon</>)}
        {actionButton("cancel", "btn btn-danger", "Cancel")}
      </div>
      <Section title={d.orgName} sub={`${d.city}, ${d.state} · ${d.users} users`}>
        <div className="bl-grid4">
          <Kv label="Plan">
            {d.plan.name}
            {paid ? <span className="bl-muted" style={{ fontWeight: 500 }}> · {d.interval}</span> : null}
          </Kv>
          <Kv label="Status">
            <span className={`badge ${STATUS_META[d.status].badge}`}>{ADMIN_STATUS_LABEL[d.status]}</span>
          </Kv>
          <Kv label={DATE_LABEL[d.status] === "—" ? "Key date" : DATE_LABEL[d.status]}>{d.keyDate ? formatDate(d.keyDate) : "—"}</Kv>
          <Kv label="Renewal">{!paid ? "—" : d.renewalMode === "auto" ? "Automatic (saved card / UPI)" : "Pay each time"}</Kv>
        </div>
        {paid ? (
          <div className="bl-muted" style={{ marginTop: 12 }}>
            Next charge {formatINR(d.renewalAmount)} incl. GST. Grace period {d.graceDays} days.
          </div>
        ) : null}
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
      <ActionDialog
        key={action ?? "none"}
        action={action}
        detail={d}
        onClose={() => setAction(null)}
        onDone={(next, message) => {
          setOverride(next);
          setAction(null);
          toast({ variant: "success", title: "Done", description: message });
        }}
      />
    </div>
  );
}
