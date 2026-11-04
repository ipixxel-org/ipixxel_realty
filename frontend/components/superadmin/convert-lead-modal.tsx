"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icons";
import { convertAdminLeadToOrg } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import { leadDisplayEmail, leadDisplayName, leadDisplayPhone } from "@/lib/lead-display";
import type { AdminLead, AdminLeadDetail } from "@/lib/types";

const ORG_DETAIL_FLASH_KEY = "saas_admin_org_detail_flash";

interface ConvertLeadModalProps {
  isOpen: boolean;
  lead: AdminLead | AdminLeadDetail | null;
  onClose: () => void;
  onSuccess?: (res: { organisation: { id: string; name: string } }) => void;
}

export function ConvertLeadModal({
  isOpen,
  lead,
  onClose,
  onSuccess,
}: ConvertLeadModalProps) {
  const router = useRouter();

  const [keepExisting, setKeepExisting] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialName = lead ? leadDisplayName(lead) : "";
  const initialEmail = lead ? leadDisplayEmail(lead) : "";
  const initialPhone = lead ? leadDisplayPhone(lead) : "";
  const initialCity =
    lead && "details" in lead && lead.details?.city
      ? lead.details.city
      : (lead?.data as Record<string, unknown> | undefined)?.city
      ? String((lead?.data as Record<string, unknown>).city)
      : "Bengaluru";

  useEffect(() => {
    if (lead) {
      const name = leadDisplayName(lead);
      const leadCompany =
        (lead.data as Record<string, unknown> | undefined)?.company ||
        (lead.data as Record<string, unknown> | undefined)?.companyName ||
        (lead.data as Record<string, unknown> | undefined)?.organisation;
      const defaultOrgName = leadCompany
        ? String(leadCompany)
        : name && name !== "Lead" && name !== "Anonymous"
        ? `${name}'s Realty`
        : "New Realty Organisation";

      setOrgName(defaultOrgName);
      setEmail(leadDisplayEmail(lead) || "");
      setPhone(leadDisplayPhone(lead) || "");
      setCity(initialCity || "Bengaluru");
      setKeepExisting(Boolean(leadDisplayEmail(lead)));
      setError(null);
    }
  }, [lead, initialCity]);

  if (!isOpen || !lead) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lead) return;

    const trimmedOrgName = orgName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedOrgName) {
      setError("Please provide an organisation name.");
      return;
    }
    if (!trimmedEmail) {
      setError("Administrator email address is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await convertAdminLeadToOrg(lead.id, {
        orgName: trimmedOrgName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        city: city.trim() || undefined,
      });

      if (onSuccess) {
        onSuccess(res);
      }

      setFlash(ORG_DETAIL_FLASH_KEY, {
        message: `Organisation “${res.organisation.name}” created! Login credentials emailed to ${res.user.email}.`,
        tab: "Overview",
      });

      onClose();
      // Step 5 Requirement: Automatically redirect to second step of Organisation Setup process
      router.push(`/admin-console/organisation-detail/${res.organisation.id}?step=2&converted=1`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to convert lead into organisation.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={submitting ? () => {} : onClose}
      title="Convert Lead into Organisation"
      description="Create an active organisation workspace and generate administrator credentials."
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error ? (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Lead Summary Header Card */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Lead Information
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
              {initialName}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {lead.formName || lead.source || "Website lead"} · ID: {lead.id.slice(0, 8)}
            </div>
          </div>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "#e0e7ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4f46e5",
            }}
          >
            <Icon name="sparkles" size={18} />
          </div>
        </div>

        {/* Account Details Decision (Requirement 3) */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
            Administrator Account Details
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setKeepExisting(true);
                setEmail(initialEmail || "");
                setPhone(initialPhone || "");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: keepExisting ? "2px solid #2563eb" : "1px solid #cbd5e1",
                background: keepExisting ? "#eff6ff" : "#ffffff",
                color: keepExisting ? "#1d4ed8" : "#475569",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>Keep Existing Details</div>
              <div style={{ fontSize: 11.5, opacity: 0.85 }}>Use email & phone from lead</div>
            </button>

            <button
              type="button"
              onClick={() => setKeepExisting(false)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: !keepExisting ? "2px solid #2563eb" : "1px solid #cbd5e1",
                background: !keepExisting ? "#eff6ff" : "#ffffff",
                color: !keepExisting ? "#1d4ed8" : "#475569",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>Change Details</div>
              <div style={{ fontSize: 11.5, opacity: 0.85 }}>Enter new email or phone</div>
            </button>
          </div>

          {keepExisting ? (
            <div
              style={{
                background: "#f1f5f9",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12.5,
                color: "#334155",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div>
                <strong>Email:</strong> {initialEmail || <span style={{ color: "#ef4444" }}>Missing in lead (please switch to Change Details)</span>}
              </div>
              <div>
                <strong>Mobile:</strong> {initialPhone || <span style={{ color: "#64748b" }}>Not provided</span>}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                  Admin Email Address <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="email"
                  className="input"
                  style={{ width: "100%", height: 38, fontSize: 13 }}
                  placeholder="admin@organisation.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
                  Admin Mobile / Phone
                </label>
                <input
                  type="tel"
                  className="input"
                  style={{ width: "100%", height: 38, fontSize: 13 }}
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Organisation Profile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
              Organisation / Company Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", height: 38, fontSize: 13 }}
              placeholder="e.g. Prestige Living Pvt Ltd"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
              City
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", height: 38, fontSize: 13 }}
              placeholder="e.g. Bengaluru"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </div>

        {/* Explanatory Callout Box (Requirement 4 & 5) */}
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 12,
            color: "#1e40af",
            lineHeight: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="check" size={14} color="#2563eb" /> Automated Credentials & Workflow
          </div>
          <div>• A secure temporary password will be automatically generated.</div>
          <div>• Login credentials will be emailed to <strong>{email || "the confirmed email"}</strong>.</div>
          <div>• The organisation admin will be prompted to change their password on first sign-in.</div>
          <div>• You will be redirected directly to <strong>Step 2 (Organisation Setup)</strong> to finish configuration.</div>
        </div>

        {/* Modal Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              minWidth: 180,
            }}
            disabled={submitting}
          >
            {submitting ? "Creating Organisation…" : "Convert & Continue to Step 2 →"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

