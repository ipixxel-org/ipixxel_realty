"use client";

import { useState } from "react";
import { formPageStyles } from "@/components/forms/form-page";
import { checkGstin, INDIAN_STATES } from "@/lib/billing/pricing";
import type { CompanyDetails, SellerSettings } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { ErrorNote, Loading } from "../ui";

/** Anchor of the section on /admin-console/settings (the Expiry card and the Razorpay page link here). */
export const COMPANY_TAX_HREF = "/admin-console/settings#company-tax";

/** The platform as GST seller: printed on invoices; its state decides CGST+SGST vs IGST. */
function SellerFields({ value, onChange }: { value: SellerSettings; onChange: (patch: Partial<SellerSettings>) => void }) {
  const text = (key: keyof SellerSettings, label: string, placeholder: string) => (
    <div className="field">
      <label htmlFor={`bl-seller-${key}`}>{label}</label>
      <input id={`bl-seller-${key}`} className="inp" value={value[key] ?? ""} placeholder={placeholder} onChange={(e) => onChange({ [key]: e.target.value })} />
    </div>
  );
  const gstinError = checkGstin(value.gstin, value.state);
  return (
    <>
      <div className="row2">
        {text("legalName", "Legal name", "iPixxel Technologies Pvt. Ltd.")}
        <div className="field">
          <label htmlFor="bl-seller-gstin">GSTIN</label>
          <input id="bl-seller-gstin" className="inp" maxLength={15} value={value.gstin ?? ""} placeholder="29ABCDE1234F1Z5" onChange={(e) => onChange({ gstin: e.target.value.toUpperCase() })} />
          {gstinError ? <div className="hint" style={{ color: "var(--rose)" }}>{gstinError}</div> : null}
        </div>
      </div>
      <div className="row2">
        {text("addressLine1", "Address", "Building, street, area")}
        {text("addressLine2", "Address line 2", "Optional")}
      </div>
      <div className="row2">
        {text("city", "City", "Bengaluru")}
        <div className="field">
          <label htmlFor="bl-seller-state">State</label>
          <select id="bl-seller-state" value={value.state ?? ""} onChange={(e) => onChange({ state: e.target.value || null })}>
            <option value="">Not set — every checkout is charged IGST</option>
            {INDIAN_STATES.map((st) => (
              <option key={st.code} value={st.code}>
                {st.name} ({st.code})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row2">
        {text("pincode", "PIN code", "560001")}
        <div />
      </div>
    </>
  );
}

function Editor({ initial }: { initial: CompanyDetails }) {
  const { client, canEdit } = useBillingEnv();
  const [saved, setSaved] = useState(initial);
  const [seller, setSeller] = useState(initial.seller);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const gstinError = checkGstin(seller.gstin, seller.state);
    if (gstinError) {
      setStatus({ tone: "err", text: `GSTIN: ${gstinError}` });
      return;
    }
    // Empty text = not set.
    const clean = Object.fromEntries(Object.entries(seller).map(([k, v]) => [k, typeof v === "string" && v.trim() ? v.trim() : null])) as unknown as SellerSettings;
    setBusy(true);
    try {
      const next = await client.saveCompanyDetails({ seller: clean, warnings: [] });
      setSaved(next);
      setSeller(next.seller);
      setStatus({ tone: "ok", text: "Company & tax details saved — new invoices use them." });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" id="company-tax-card">
      <div className="card-h">
        <span className="t">Company &amp; tax details</span>
        <span className="x">Printed on every GST invoice</span>
      </div>
      <div className={`card-b ${formPageStyles.page}`} style={{ display: "grid", gap: 4 }}>
        {saved.warnings.map((w) => (
          <div key={w.code} className="form-alert" role="status" style={{ marginBottom: 8 }}>
            {w.message}
          </div>
        ))}
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, marginBottom: 8 }}>
          Our details as the seller on GST invoices. The state decides the tax split: a buyer in the same state pays CGST + SGST, anyone else IGST.
        </div>
        <SellerFields
          value={seller}
          onChange={(patch) => {
            setSeller((s) => ({ ...s, ...patch }));
            setStatus(null);
          }}
        />
        {status ? <div style={{ fontSize: 12.5, fontWeight: 600, color: status.tone === "ok" ? "var(--green)" : "var(--rose)" }}>{status.text}</div> : null}
        <div className={formPageStyles.actions}>
          <button className={formPageStyles.btn} type="button" onClick={() => setSeller(saved.seller)}>
            Discard
          </button>
          <button className={formPageStyles.btnPrimary} type="button" onClick={() => void save()} disabled={busy || !canEdit}>
            {busy ? "Saving…" : "Save company details"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Super Admin → Settings → "Company & tax details" (billing v2). */
export function CompanyTaxDetailsCard() {
  const { data, error } = useBillingQuery((c) => c.getCompanyDetails(), []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="company details" />;
  return <Editor initial={data} />;
}
