"use client";

import { Icon } from "@/components/icons";
import { formatDate, formatINR } from "@/lib/billing/pricing";
import type { OrgCoupon, OrgCouponStatus } from "@/lib/billing/types";
import { useBillingQuery } from "./context";
import { BLink, Empty, ErrorNote, Loading, Section } from "./ui";

const STATUS: Record<OrgCouponStatus, { label: string; badge: string }> = {
  available: { label: "Available", badge: "b-green" },
  redeemed: { label: "Redeemed", badge: "b-indigo" },
  expired: { label: "Expired", badge: "b-gray" },
  used_up: { label: "Used up", badge: "b-gray" },
};

const discount = (c: OrgCoupon) => (c.kind === "percent" ? `${c.value}% off` : `${formatINR(c.value)} off`);

const appliesFor = (c: OrgCoupon) =>
  c.duration === "first_payment" ? "First payment" : c.duration === "forever" ? "Every payment" : `First ${c.durationCount ?? 2} payments`;

const intervalLabel = (c: OrgCoupon) => (c.interval === "any" ? "Monthly & yearly" : c.interval === "monthly" ? "Monthly only" : "Yearly only");

/** Org Settings → Billing → Coupons: codes reserved for the org and public ones Super Admin listed. */
export function OrgCouponsScreen() {
  const { data, error } = useBillingQuery((c) => c.listOrgCoupons(), []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="coupons" />;
  return (
    <Section title="Your coupons" sub="Offers for your organisation. Discounts come off before GST." flush>
      {data.length === 0 ? (
        <Empty>No coupons for your organisation right now.</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Plans · billing</th>
                <th>Applies to</th>
                <th>Valid until</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.code} data-testid="org-coupon-row">
                  <td>
                    <b className="bl-mono">{c.code}</b>
                    {c.forYourOrg ? <div className="bl-muted bl-small">Just for your organisation</div> : null}
                  </td>
                  <td>
                    {discount(c)}
                    <div className="bl-muted bl-small">{c.description}</div>
                  </td>
                  <td>
                    {c.plans.map((p) => p.name).join(", ")}
                    <div className="bl-muted bl-small">{intervalLabel(c)}</div>
                  </td>
                  <td>{appliesFor(c)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{c.validTo ? formatDate(c.validTo) : "No end date"}</td>
                  <td>
                    <span className={`badge ${STATUS[c.status].badge}`}>{STATUS[c.status].label}</span>
                    {c.redeemedAt ? (
                      <div className="bl-muted bl-small" style={{ marginTop: 3 }}>
                        {c.status === "redeemed" ? "on" : "used"} {formatDate(c.redeemedAt.slice(0, 10))}
                        {c.invoiceUrl ? (
                          <>
                            {" · "}
                            <a href={c.invoiceUrl} target="_blank" rel="noopener noreferrer">
                              {c.invoiceNumber ?? "Invoice"}
                            </a>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {c.status === "available" ? (
                      <BLink to="plans" params={{ coupon: c.code, interval: c.interval === "any" ? undefined : c.interval }} className="btn btn-ghost btn-sm">
                        <Icon name="tag" size={13} /> Use at checkout
                      </BLink>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
