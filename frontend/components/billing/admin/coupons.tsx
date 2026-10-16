"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { ListPager, usePagedRows } from "@/components/ui/list-pager";
import { useToast } from "@/components/ui/toast";
import { daysBetween, describeCoupon, formatDate, formatINR } from "@/lib/billing/pricing";
import type { Coupon, CouponDuration, CouponStatus } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { BLink, Empty, ErrorNote, Kv, Loading, Section } from "../ui";

export const COUPON_STATUS: Record<CouponStatus, { label: string; badge: string }> = {
  active: { label: "Active", badge: "b-green" },
  scheduled: { label: "Scheduled", badge: "b-sky" },
  expired: { label: "Expired", badge: "b-gray" },
  used_up: { label: "Used up", badge: "b-amber" },
};


/* ------------------------------------------------------------------- List */

export function CouponsList() {
  const [q, setQ] = useState("");
  const { data, error } = useBillingQuery((c) => c.listCoupons(), []);
  const { data: plans } = useBillingQuery((c) => c.listAdminPlans(), []);
  const planLabel = (ids: string[]) => ids.map((id) => plans?.find((p) => p.id === id)?.name ?? id).join(", ");
  const rows = (data ?? []).filter((r) => r.coupon.code.includes(q.trim().toUpperCase()));
  const paged = usePagedRows(rows, q);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="coupons" />;
  return (
    <div className="bl-stack">
      <input className="inp" style={{ maxWidth: 280 }} placeholder="Search by code…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Section title={`${rows.length} coupons`} flush>
        {rows.length === 0 ? (
          <Empty>No coupons match.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Plans · billing</th>
                  <th>Valid</th>
                  <th>Uses</th>
                  <th>Who</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map(({ coupon: c, uses, status }) => (
                  <tr key={c.code}>
                    <td>
                      <b className="bl-mono">{c.code}</b>
                      <div className="bl-muted bl-small">{c.description}</div>
                    </td>
                    <td>{describeCoupon(c)}</td>
                    <td>
                      {planLabel(c.planIds)}
                      <div className="bl-muted bl-small">{c.interval === "any" ? "Monthly & yearly" : c.interval === "monthly" ? "Monthly only" : "Yearly only"}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatDate(c.validFrom)}
                      <div className="bl-muted bl-small">{c.validTo ? `to ${formatDate(c.validTo)}` : "no end date"}</div>
                    </td>
                    <td>
                      <b>{uses}</b>
                      {c.totalUses != null ? ` / ${c.totalUses}` : ""}
                      <div className="bl-muted bl-small">{c.oncePerOrg ? "once per org" : "repeat use"}</div>
                    </td>
                    <td>
                      {c.orgIds ? `${c.orgIds.length} org${c.orgIds.length === 1 ? "" : "s"} only` : "All orgs"}
                      {!c.orgIds && c.showToCustomers ? <div className="bl-muted bl-small">listed for customers</div> : null}
                    </td>
                    <td>
                      <span className={`badge ${COUPON_STATUS[status].badge}`}>{COUPON_STATUS[status].label}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <BLink to="adminCoupon" params={{ code: c.code }} className="btn btn-ghost btn-sm">
                        Usage
                      </BLink>{" "}
                      <BLink to="adminCouponEdit" params={{ code: c.code }} className="btn btn-ghost btn-sm">
                        <Icon name="edit" size={13} /> Edit
                      </BLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <ListPager page={paged.page} total={paged.total} onPageChange={paged.setPage} noun="coupons" />
    </div>
  );
}

/* ------------------------------------------------------------------- Form */

export const BLANK_COUPON: Coupon = {
  code: "",
  description: "",
  kind: "percent",
  value: 10,
  planIds: ["growth", "pro"],
  interval: "any",
  duration: "first_payment",
  durationCount: 3,
  validFrom: new Date().toISOString().slice(0, 10),
  validTo: null,
  totalUses: null,
  oncePerOrg: true,
  orgIds: null,
  showToCustomers: false,
};

type Errors = Partial<Record<"code" | "value" | "plans" | "dates" | "durationCount" | "orgIds" | "totalUses", string>>;

function validate(c: Coupon): Errors {
  const e: Errors = {};
  if (!/^[A-Z0-9]{3,20}$/.test(c.code)) e.code = "3–20 letters or digits, no spaces.";
  if (!(c.value > 0)) e.value = "Enter a value above zero.";
  else if (c.kind === "percent" && c.value > 100) e.value = "A percentage can't be more than 100.";
  else if (c.kind === "percent" && !Number.isInteger(c.value)) e.value = "Use a whole number (e.g. 15).";
  if (c.planIds.length === 0) e.plans = "Pick at least one plan.";
  if (c.validTo && daysBetween(c.validFrom, c.validTo) < 0) e.dates = "The end date is before the start date.";
  if (c.duration === "first_n" && !((c.durationCount ?? 0) >= 2)) e.durationCount = "Use 2 or more (1 is the same as “First payment”).";
  if (c.orgIds && c.orgIds.length === 0) e.orgIds = "Pick at least one organisation, or open it to all.";
  if (c.totalUses != null && c.totalUses < 1) e.totalUses = "Leave blank for unlimited, or enter 1 or more.";
  return e;
}

export function CouponForm({ initial, isNew }: { initial: Coupon; isNew: boolean }) {
  const { client, nav, canEdit } = useBillingEnv();
  const { toast } = useToast();
  const { data: orgOptions } = useBillingQuery((cl) => cl.listOrgOptions(), []);
  const { data: plans } = useBillingQuery((cl) => cl.listAdminPlans(), []);
  const [c, setC] = useState<Coupon>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const set = (patch: Partial<Coupon>) => setC((prev) => ({ ...prev, ...patch }));
  const err = (k: keyof Errors) => (submitted && errors[k] ? <div className="bl-field-err">{errors[k]}</div> : null);
  const orgs = (orgOptions ?? []).filter((o) => o.name.toLowerCase().includes(orgSearch.toLowerCase()));
  const paidPlans = (plans ?? []).filter((p) => !p.isFree);
  // The blank coupon carries the walkthrough's sample plan ids: with real plans a new coupon
  // starts on every paid plan (until the first tick changes it).
  const known = paidPlans.map((p) => p.id);
  const form: Coupon = plans && isNew && c.planIds.some((id) => !known.includes(id)) ? { ...c, planIds: known } : c;
  const errors = validate(form);

  async function save() {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await client.saveCoupon({ coupon: form, isNew });
      toast({ variant: "success", title: isNew ? `${c.code} created` : `${c.code} saved` });
      nav.go("adminCoupons");
    } catch (e) {
      toast({ variant: "error", title: "Couldn't save the coupon", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      <Section title="Discount">
        <div className="bl-stack" style={{ gap: 14 }}>
          <div className="row2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Code</label>
              <input className="inp bl-mono" value={c.code} disabled={!isNew} placeholder="SUMMER15" onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} />
              {!isNew ? <div className="hint">Codes can&apos;t be renamed once customers may have seen them.</div> : null}
              {err("code")}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Description (internal)</label>
              <input className="inp" value={c.description} placeholder="Partner deal for Q4" onChange={(e) => set({ description: e.target.value })} />
            </div>
          </div>
          <div className="row2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select className="inp" value={c.kind} onChange={(e) => set({ kind: e.target.value as Coupon["kind"] })}>
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off (₹)</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{c.kind === "percent" ? "Percent" : "Amount (₹, before GST)"}</label>
              <input className="inp" type="number" min={0} value={c.value} onChange={(e) => set({ value: Number(e.target.value) })} />
              {err("value")}
            </div>
          </div>
          <div className="bl-muted">Preview: {c.value > 0 ? describeCoupon(c) : "—"}</div>
        </div>
      </Section>

      <Section title="Where it applies">
        <div className="bl-stack" style={{ gap: 14 }}>
          <div className="row2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Plans</label>
              <div className="bl-row" style={{ gap: 16, minHeight: 38 }}>
                {paidPlans.map((p) => (
                  <label key={p.id} className="bl-row" style={{ gap: 6, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.planIds.includes(p.id)}
                      onChange={(e) => set({ planIds: e.target.checked ? [...form.planIds, p.id] : form.planIds.filter((x) => x !== p.id) })}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <div className="hint">Basic is free, so coupons never apply to it.</div>
              {err("plans")}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Billing</label>
              <select className="inp" value={c.interval} onChange={(e) => set({ interval: e.target.value as Coupon["interval"] })}>
                <option value="any">Monthly and yearly</option>
                <option value="monthly">Monthly only</option>
                <option value="yearly">Yearly only</option>
              </select>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>How long it lasts</label>
            <div className="bl-row" style={{ gap: 18 }}>
              {(
                [
                  ["first_payment", "First payment only"],
                  ["first_n", "First N renewals"],
                  ["forever", "Forever"],
                ] as [CouponDuration, string][]
              ).map(([v, l]) => (
                <label key={v} className="bl-row" style={{ gap: 6, cursor: "pointer" }}>
                  <input type="radio" name="bl-duration" checked={c.duration === v} onChange={() => set({ duration: v })} />
                  {l}
                </label>
              ))}
              {c.duration === "first_n" ? (
                <input
                  className="inp"
                  type="number"
                  min={2}
                  style={{ width: 80 }}
                  value={c.durationCount ?? 3}
                  onChange={(e) => set({ durationCount: Math.floor(Number(e.target.value) || 0) })}
                  aria-label="Number of payments"
                />
              ) : null}
            </div>
            {c.duration === "first_n" ? <div className="hint">Counts the first payment — 3 on a monthly plan means the first 3 months.</div> : null}
            {err("durationCount")}
          </div>
        </div>
      </Section>

      <Section title="Limits & dates">
        <div className="bl-stack" style={{ gap: 14 }}>
          <div className="bl-grid3" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Valid from</label>
              <input className="inp" type="date" value={c.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Valid until (optional)</label>
              <input className="inp" type="date" value={c.validTo ?? ""} onChange={(e) => set({ validTo: e.target.value || null })} />
              {err("dates")}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Total uses (optional)</label>
              <input
                className="inp"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={c.totalUses ?? ""}
                onChange={(e) => set({ totalUses: e.target.value === "" ? null : Math.floor(Number(e.target.value)) })}
              />
              <div className="hint">Counts organisations, not payments.</div>
              {err("totalUses")}
            </div>
          </div>
          <label className="bl-row" style={{ gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={c.oncePerOrg} onChange={(e) => set({ oncePerOrg: e.target.checked })} />
            Once per organisation
          </label>
        </div>
      </Section>

      <Section title="Who can use it">
        <div className="bl-stack" style={{ gap: 12 }}>
          <div className="bl-row" style={{ gap: 18 }}>
            <label className="bl-row" style={{ gap: 6, cursor: "pointer" }}>
              <input type="radio" name="bl-audience" checked={c.orgIds === null} onChange={() => set({ orgIds: null })} />
              Every organisation
            </label>
            <label className="bl-row" style={{ gap: 6, cursor: "pointer" }}>
              <input type="radio" name="bl-audience" checked={c.orgIds !== null} onChange={() => set({ orgIds: c.orgIds ?? [], showToCustomers: false })} />
              Only specific organisations
            </label>
          </div>
          {c.orgIds === null ? (
            <label className="bl-row" style={{ gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={c.showToCustomers} onChange={(e) => set({ showToCustomers: e.target.checked })} />
              <span>
                Show in customers&apos; coupon list
                <span className="bl-muted"> — every organisation sees it under Billing → Coupons. Off: only people you give the code to know it.</span>
              </span>
            </label>
          ) : (
            <div className="hint" style={{ marginTop: 0 }}>
              These organisations see it under Billing → Coupons.
            </div>
          )}
          {c.orgIds !== null ? (
            <div>
              <div className="bl-between" style={{ marginBottom: 8 }}>
                <input className="inp" style={{ maxWidth: 260 }} placeholder="Search organisations…" value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)} />
                <span className="bl-counter">{c.orgIds.length} selected</span>
              </div>
              <div style={{ border: "1px solid var(--line-2)", borderRadius: 12, maxHeight: 240, overflowY: "auto" }}>
                {orgs.map((o) => (
                  <label key={o.id} className="bl-tick-row">
                    <input
                      type="checkbox"
                      checked={c.orgIds!.includes(o.id)}
                      onChange={(e) => set({ orgIds: e.target.checked ? [...c.orgIds!, o.id] : c.orgIds!.filter((x) => x !== o.id) })}
                    />
                    <span className="bl-tick-main">
                      <b>{o.name}</b>
                      <span className="bl-muted">
                        {o.city} · {o.planName}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {err("orgIds")}
            </div>
          ) : null}
        </div>
      </Section>

      <div className="bl-row">
        <button type="button" className="btn btn-primary" disabled={busy || !canEdit} onClick={() => void save()}>
          {isNew ? "Create coupon" : "Save changes"}
        </button>
        <BLink to="adminCoupons" className="btn btn-ghost">
          Cancel
        </BLink>
        {submitted && Object.keys(errors).length ? <span className="bl-field-err" style={{ marginTop: 0 }}>Fix the highlighted fields.</span> : null}
      </div>
    </div>
  );
}

/** Loads an existing coupon into the form. */
export function EditCoupon({ code }: { code: string }) {
  const { data, error } = useBillingQuery((c) => c.getCoupon(code), [code]);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="coupon" />;
  return <CouponForm key={code} initial={data.coupon} isNew={false} />;
}

/* ------------------------------------------------------------------ Usage */

export function CouponUsage({ code }: { code: string }) {
  const { data, error } = useBillingQuery((c) => c.getCoupon(code), [code]);
  const paged = usePagedRows(data?.redemptions ?? [], code);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="coupon" />;
  const st = COUPON_STATUS[data.status];
  return (
    <div className="bl-stack">
      <Section
        title={<span className="bl-mono">{data.coupon.code}</span>}
        sub={data.coupon.description}
        action={
          <BLink to="adminCouponEdit" params={{ code }} className="btn btn-ghost btn-sm">
            <Icon name="edit" size={13} /> Edit
          </BLink>
        }
      >
        <div className="bl-grid4">
          <Kv label="Discount">{describeCoupon(data.coupon)}</Kv>
          <Kv label="Status">
            <span className={`badge ${st.badge}`}>{st.label}</span>
          </Kv>
          <Kv label="Organisations">
            {data.uses}
            {data.coupon.totalUses != null ? ` of ${data.coupon.totalUses}` : " (no limit)"}
          </Kv>
          <Kv label="Total discount given">{formatINR(data.totalDiscount)}</Kv>
        </div>
      </Section>
      <Section title="Who used it" sub="Every payment the coupon reduced" flush>
        {data.redemptions.length === 0 ? (
          <Empty>Nobody has used {data.coupon.code} yet.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Organisation</th>
                  <th>Date</th>
                  <th>Plan</th>
                  <th style={{ textAlign: "right" }}>Discount</th>
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((r, i) => (
                  <tr key={`${r.orgId}-${r.at}-${i}`}>
                    <td>
                      <BLink to="adminSubscription" params={{ orgId: r.orgId }} className="bl-strong" style={{ color: "inherit" }}>
                        {r.orgName}
                      </BLink>
                    </td>
                    <td>{formatDate(r.at)}</td>
                    <td>{r.planName}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(r.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <ListPager page={paged.page} total={paged.total} onPageChange={paged.setPage} noun="redemptions" />
    </div>
  );
}
