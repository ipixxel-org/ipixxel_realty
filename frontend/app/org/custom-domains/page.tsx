"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  assignCustomDomain,
  deleteCustomDomain,
  getOrgDomainInfo,
  publishOrgCustomDomain,
  requestCustomDomain,
  unpublishOrgCustomDomain,
  verifyOrgDomainDns,
  verifyOrgDomainSsl,
} from "@/lib/api";
import type {
  DnsRecordSpec,
  OrgDomainInfo,
  OrgDomainLandingPage,
  OrgDomainRequest,
  RequestCustomDomainInput,
} from "@/lib/types";

const STATUS_BADGES: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: "Pending Approval",
    bg: "rgba(245, 158, 11, 0.1)",
    text: "#f59e0b",
    border: "rgba(245, 158, 11, 0.25)",
  },
  changes_requested: {
    label: "Changes Requested",
    bg: "rgba(249, 115, 22, 0.1)",
    text: "#f97316",
    border: "rgba(249, 115, 22, 0.25)",
  },
  approved: {
    label: "Approved (DNS Required)",
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#3b82f6",
    border: "rgba(59, 130, 246, 0.25)",
  },
  connected: {
    label: "Live",
    bg: "rgba(16, 185, 129, 0.1)",
    text: "#10b981",
    border: "rgba(16, 185, 129, 0.25)",
  },
  rejected: {
    label: "Rejected",
    bg: "rgba(244, 63, 94, 0.1)",
    text: "#f43f5e",
    border: "rgba(244, 63, 94, 0.25)",
  },
  suspended: {
    label: "Suspended",
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#ef4444",
    border: "rgba(239, 68, 68, 0.3)",
  },
};

export default function OrgCustomDomainsPage() {
  const [data, setData] = useState<OrgDomainInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [dnsModalReq, setDnsModalReq] = useState<OrgDomainRequest | null>(null);
  const [mapModalReq, setMapModalReq] = useState<OrgDomainRequest | null>(null);
  const [deleteModalReq, setDeleteModalReq] = useState<OrgDomainRequest | null>(null);

  // Add domain form state
  const [newDomain, setNewDomain] = useState("");
  const [newDomainType, setNewDomainType] = useState<"apex" | "subdomain">("apex");
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newLandingPageId, setNewLandingPageId] = useState<string>("");
  const [newPreferredHost, setNewPreferredHost] = useState<string>("");
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [newRedirectWww, setNewRedirectWww] = useState(true);
  const [newOwnershipConfirmed, setNewOwnershipConfirmed] = useState(false);
  const [newNotes, setNewNotes] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Map / Assign form state
  const [selectedMapProjectId, setSelectedMapProjectId] = useState("");
  const [selectedMapPageId, setSelectedMapPageId] = useState("");
  const [mapSubmitting, setMapSubmitting] = useState(false);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await getOrgDomainInfo();
      setData(res);
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to load domain information",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const requests = useMemo(() => data?.requests ?? [], [data]);
  const landingPages = useMemo(() => data?.landingPages ?? [], [data]);
  const projects = useMemo(() => data?.projects ?? [], [data]);

  // Derived filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const domainMatch = r.customDomain?.toLowerCase().includes(q);
        const pageMatch = r.landingPage?.name?.toLowerCase().includes(q);
        const projMatch = r.project?.name?.toLowerCase().includes(q);
        if (!domainMatch && !pageMatch && !projMatch) return false;
      }
      if (activeTab === "all") return true;
      if (activeTab === "live") return r.status === "connected" && !r.isSuspended;
      if (activeTab === "pending") return r.status === "pending";
      if (activeTab === "dns_pending")
        return (
          (r.status === "approved" || r.status === "connected") &&
          r.dnsStatus !== "verified"
        );
      if (activeTab === "ssl_issues")
        return (
          r.sslStatus === "failed" ||
          (r.status === "connected" && r.sslStatus !== "active")
        );
      if (activeTab === "changes_requested") return r.status === "changes_requested";
      if (activeTab === "rejected") return r.status === "rejected";
      if (activeTab === "suspended") return r.isSuspended || r.status === "suspended";
      return true;
    });
  }, [requests, activeTab, search]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    if (!newOwnershipConfirmed) {
      setFeedbackMsg({
        type: "error",
        text: "Please confirm that your organisation owns and controls this domain.",
      });
      return;
    }

    setAddSubmitting(true);
    setFeedbackMsg(null);
    try {
      const payload: RequestCustomDomainInput = {
        domain: newDomain.trim(),
        domainType: newDomainType,
        projectId: newProjectId || undefined,
        landingPageId: newLandingPageId || undefined,
        preferredHostname: newPreferredHost.trim() || undefined,
        isPrimary: newIsPrimary,
        redirectWww: newRedirectWww,
        ownershipConfirmed: true,
        notes: newNotes.trim() || undefined,
      };

      await requestCustomDomain(payload);
      setAddModalOpen(false);
      setNewDomain("");
      setNewProjectId("");
      setNewLandingPageId("");
      setNewNotes("");
      setNewOwnershipConfirmed(false);
      setFeedbackMsg({
        type: "success",
        text: "Custom domain request submitted successfully! Super Admin will review your request.",
      });
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to submit domain request",
      });
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleVerifyDns = async (reqId: string) => {
    setBusyId(reqId);
    setFeedbackMsg(null);
    try {
      const updated = await verifyOrgDomainDns(reqId);
      setFeedbackMsg({
        type: "success",
        text:
          updated.dnsStatus === "verified"
            ? `DNS records verified successfully for ${updated.customDomain}! SSL HTTPS certificate automatically activated.`
            : `DNS check completed for ${updated.customDomain}. Propagation may take a few minutes. Check status details.`,
      });
      await loadData();
      if (dnsModalReq?.id === reqId) {
        setDnsModalReq(updated);
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "DNS verification check failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleVerifySsl = async (reqId: string) => {
    setBusyId(reqId);
    setFeedbackMsg(null);
    try {
      const updated = await verifyOrgDomainSsl(reqId);
      setFeedbackMsg({
        type: "success",
        text:
          updated.sslStatus === "active"
            ? `SSL HTTPS certificate is active and verified for ${updated.customDomain}!`
            : `SSL status is currently ${updated.sslStatus}. Certificate provisioning is in progress.`,
      });
      await loadData();
      if (dnsModalReq?.id === reqId) {
        setDnsModalReq(updated);
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "SSL check failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePublish = async (reqId: string) => {
    setBusyId(reqId);
    setFeedbackMsg(null);
    try {
      const updated = await publishOrgCustomDomain(reqId);
      setFeedbackMsg({
        type: "success",
        text: `Success! ${updated.customDomain} is now LIVE and serving your landing page.`,
      });
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to publish domain",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleUnpublish = async (reqId: string) => {
    setBusyId(reqId);
    setFeedbackMsg(null);
    try {
      await unpublishOrgCustomDomain(reqId);
      setFeedbackMsg({
        type: "success",
        text: "Domain has been unpublished. It is no longer serving public traffic.",
      });
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to unpublish domain",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapModalReq) return;
    setMapSubmitting(true);
    setFeedbackMsg(null);
    try {
      await assignCustomDomain({
        domainRequestId: mapModalReq.id,
        landingPageId: selectedMapPageId || null,
        projectId: selectedMapProjectId || null,
      });
      setMapModalReq(null);
      setFeedbackMsg({
        type: "success",
        text: "Domain mapping updated successfully.",
      });
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to update domain mapping",
      });
    } finally {
      setMapSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModalReq) return;
    setBusyId(deleteModalReq.id);
    try {
      await deleteCustomDomain(deleteModalReq.id);
      setDeleteModalReq(null);
      setFeedbackMsg({
        type: "success",
        text: "Custom domain request removed successfully.",
      });
      await loadData();
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to delete domain request",
      });
    } finally {
      setBusyId(null);
    }
  };

  // Filter landing pages by selected project in Add modal
  const addModalFilteredPages = useMemo(() => {
    if (!newProjectId) return landingPages;
    return landingPages.filter((p) => p.projectId === newProjectId);
  }, [landingPages, newProjectId]);

  // Filter landing pages in Map modal
  const mapModalFilteredPages = useMemo(() => {
    if (!selectedMapProjectId) return landingPages;
    return landingPages.filter((p) => p.projectId === selectedMapProjectId);
  }, [landingPages, selectedMapProjectId]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: "var(--muted)",
              marginBottom: 4,
            }}
          >
            <Link href="/org" style={{ color: "inherit", textDecoration: "none" }}>
              Dashboard
            </Link>
            <span>/</span>
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>
              Custom Domains
            </span>
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              margin: 0,
              color: "var(--ink)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            Custom Domains
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(59, 130, 246, 0.12)",
                color: "#3b82f6",
              }}
            >
              Multi-Domain Support
            </span>
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--muted)",
              margin: "4px 0 0",
              maxWidth: 640,
            }}
          >
            Request and map multiple custom domains for your landing pages.
            Configure DNS records, verify SSL certificates, and publish with complete
            tenant isolation.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => loadData()}
            className="btn btn-outline"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              padding: "8px 14px",
            }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => {
              setNewDomain("");
              setNewProjectId("");
              setNewLandingPageId("");
              setNewNotes("");
              setNewOwnershipConfirmed(false);
              setAddModalOpen(true);
            }}
            className="btn btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 16px",
            }}
          >
            <Plus size={16} />
            Add Domain
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMsg && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 13,
            background:
              feedbackMsg.type === "success"
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(244, 63, 94, 0.1)",
            color: feedbackMsg.type === "success" ? "#10b981" : "#f43f5e",
            border: `1px solid ${
              feedbackMsg.type === "success"
                ? "rgba(16, 185, 129, 0.25)"
                : "rgba(244, 63, 94, 0.25)"
            }`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {feedbackMsg.type === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top 5 Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Total Domains</span>
            <Globe size={16} style={{ opacity: 0.5 }} />
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "var(--ink)",
              letterSpacing: "-0.03em",
            }}
          >
            {data?.metrics?.totalDomains ?? requests.length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Configured for this organisation
          </div>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Pending Approvals</span>
            <Clock size={16} style={{ color: "#f59e0b" }} />
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#f59e0b",
              letterSpacing: "-0.03em",
            }}
          >
            {data?.metrics?.pendingApprovals ??
              requests.filter((r) => r.status === "pending").length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Awaiting Super Admin review
          </div>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>DNS Pending</span>
            <AlertTriangle size={16} style={{ color: "#3b82f6" }} />
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#3b82f6",
              letterSpacing: "-0.03em",
            }}
          >
            {data?.metrics?.dnsPending ??
              requests.filter(
                (r) =>
                  (r.status === "approved" || r.status === "connected") &&
                  r.dnsStatus !== "verified",
              ).length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Approved, DNS setup needed
          </div>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>SSL Issues</span>
            <ShieldAlert size={16} style={{ color: "#f43f5e" }} />
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: (data?.metrics?.sslIssues ?? 0) > 0 ? "#f43f5e" : "var(--ink)",
              letterSpacing: "-0.03em",
            }}
          >
            {data?.metrics?.sslIssues ?? 0}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Certificates failed or pending
          </div>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-2)",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Live Domains</span>
            <CheckCircle2 size={16} style={{ color: "#10b981" }} />
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#10b981",
              letterSpacing: "-0.03em",
            }}
          >
            {data?.metrics?.liveDomains ??
              requests.filter((r) => r.status === "connected" && !r.isSuspended).length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
            Serving landing pages securely
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line-2)",
          borderRadius: 14,
          padding: 14,
          marginBottom: 20,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            { id: "all", label: "All Domains", count: requests.length },
            {
              id: "live",
              label: "Live",
              count: requests.filter((r) => r.status === "connected" && !r.isSuspended)
                .length,
            },
            {
              id: "pending",
              label: "Pending Review",
              count: requests.filter((r) => r.status === "pending").length,
            },
            {
              id: "dns_pending",
              label: "DNS Configuration Required",
              count: requests.filter(
                (r) =>
                  (r.status === "approved" || r.status === "connected") &&
                  r.dnsStatus !== "verified",
              ).length,
            },
            {
              id: "changes_requested",
              label: "Changes Requested",
              count: requests.filter((r) => r.status === "changes_requested").length,
            },
            {
              id: "rejected",
              label: "Rejected",
              count: requests.filter((r) => r.status === "rejected").length,
            },
            {
              id: "suspended",
              label: "Suspended",
              count: requests.filter((r) => r.isSuspended || r.status === "suspended")
                .length,
            },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  border: "none",
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--surface)" : "var(--muted)",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    opacity: active ? 0.9 : 0.6,
                    padding: "1px 6px",
                    borderRadius: 10,
                    background: active
                      ? "rgba(255, 255, 255, 0.2)"
                      : "var(--line-2)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ position: "relative", minWidth: 240, maxWidth: 320, width: "100%" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted)",
            }}
          />
          <input
            type="text"
            className="inp"
            placeholder="Search domains or pages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              paddingLeft: 32,
              fontSize: 12.5,
              height: 34,
              borderRadius: 8,
              width: "100%",
            }}
          />
        </div>
      </div>

      {/* Main Domains Table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line-2)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%", margin: 0 }}>
            <thead>
              <tr style={{ background: "rgba(0, 0, 0, 0.02)", fontSize: 12 }}>
                <th style={{ padding: "12px 16px" }}>Domain Name</th>
                <th>Target Landing Page</th>
                <th>Workflow Status</th>
                <th>DNS Routing</th>
                <th>SSL Certificate</th>
                <th>Timeline</th>
                <th style={{ textAlign: "right", paddingRight: 16 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "48px 16px" }}>
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>
                      {loading ? (
                        <span>Loading domains...</span>
                      ) : search ? (
                        <span>No domains matching &ldquo;{search}&rdquo;</span>
                      ) : (
                        <div>
                          <Globe
                            size={32}
                            style={{
                              margin: "0 auto 10px",
                              opacity: 0.3,
                              display: "block",
                            }}
                          />
                          <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
                            No custom domains requested yet
                          </div>
                          <div style={{ fontSize: 12.5, marginBottom: 14 }}>
                            Click &ldquo;Add Domain&rdquo; above to map your first domain to a landing page.
                          </div>
                          <button
                            onClick={() => setAddModalOpen(true)}
                            className="btn btn-primary btn-sm"
                          >
                            <Plus size={14} /> Add Domain
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const badge =
                    STATUS_BADGES[req.status] || STATUS_BADGES.pending;
                  const isBusy = busyId === req.id;
                  const isApex = req.domainType === "apex";

                  return (
                    <tr key={req.id} style={{ borderBottom: "1px solid var(--line-2)" }}>
                      {/* Domain Name */}
                      <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              fontSize: 13.5,
                              color: "var(--ink)",
                            }}
                          >
                            {req.customDomain}
                          </span>
                          {req.isPrimary && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                padding: "1px 6px",
                                borderRadius: 4,
                                background: "rgba(59, 130, 246, 0.12)",
                                color: "#3b82f6",
                              }}
                            >
                              Primary
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "rgba(0, 0, 0, 0.05)",
                              color: "var(--muted)",
                            }}
                          >
                            {isApex ? "Apex" : "Subdomain"}
                          </span>
                        </div>
                        {req.preferredHostname &&
                          req.preferredHostname !== req.customDomain && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                marginTop: 3,
                              }}
                            >
                              Preferred: {req.preferredHostname}
                            </div>
                          )}
                        {req.status === "changes_requested" && req.adminFeedback && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "#f97316",
                              marginTop: 4,
                              background: "rgba(249, 115, 22, 0.08)",
                              padding: "4px 8px",
                              borderRadius: 6,
                            }}
                          >
                            <strong>Changes:</strong> {req.adminFeedback}
                          </div>
                        )}
                        {req.status === "rejected" && req.rejectionReason && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "#f43f5e",
                              marginTop: 4,
                              background: "rgba(244, 63, 94, 0.08)",
                              padding: "4px 8px",
                              borderRadius: 6,
                            }}
                          >
                            <strong>Reason:</strong> {req.rejectionReason}
                          </div>
                        )}
                        {req.isSuspended && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "#ef4444",
                              marginTop: 4,
                              background: "rgba(239, 68, 68, 0.08)",
                              padding: "4px 8px",
                              borderRadius: 6,
                            }}
                          >
                            <strong>Suspension:</strong>{" "}
                            {req.suspendedReason || "Suspended by Super Admin"}
                          </div>
                        )}
                      </td>

                      {/* Landing Page */}
                      <td style={{ verticalAlign: "middle" }}>
                        {req.landingPage ? (
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 13,
                                color: "var(--ink)",
                              }}
                            >
                              {req.landingPage.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: "var(--muted)",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginTop: 2,
                              }}
                            >
                              <span style={{ fontFamily: "monospace", color: "var(--muted)" }}>
                                /{req.landingPage.slug}
                              </span>
                              <span>•</span>
                              <span
                                style={{
                                  color:
                                    req.landingPage.status === "published"
                                      ? "#10b981"
                                      : "var(--muted)",
                                  fontWeight: 500,
                                }}
                              >
                                {req.landingPage.status}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: "var(--muted)", fontSize: 12 }}>
                            <em>Not mapped yet</em>
                          </div>
                        )}
                      </td>

                      {/* Workflow Status */}
                      <td style={{ verticalAlign: "middle" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 11.5,
                            fontWeight: 600,
                            padding: "3px 9px",
                            borderRadius: 14,
                            background: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: badge.text,
                            }}
                          />
                          {badge.label}
                        </span>
                      </td>

                      {/* DNS Status */}
                      <td style={{ verticalAlign: "middle" }}>
                        {req.dnsStatus === "verified" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              color: "#10b981",
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 size={14} /> Verified
                          </span>
                        ) : req.dnsStatus === "failed" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              color: "#f43f5e",
                              fontWeight: 600,
                            }}
                          >
                            <AlertCircle size={14} /> Failed / Mismatch
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              color: "#f59e0b",
                              fontWeight: 500,
                            }}
                          >
                            <Clock size={14} /> Pending Setup
                          </span>
                        )}
                      </td>

                      {/* SSL Status */}
                      <td style={{ verticalAlign: "middle" }}>
                        {req.sslStatus === "active" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              color: "#10b981",
                              fontWeight: 600,
                            }}
                          >
                            <ShieldCheck size={14} /> Active (HTTPS)
                          </span>
                        ) : req.sslStatus === "provisioning" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              color: "#3b82f6",
                              fontWeight: 500,
                            }}
                          >
                            <RefreshCw size={13} className="spin" /> Provisioning
                          </span>
                        ) : req.sslStatus === "failed" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              color: "#f43f5e",
                              fontWeight: 600,
                            }}
                          >
                            <ShieldAlert size={14} /> Failed
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 11.5,
                              color: "var(--muted)",
                            }}
                          >
                            <Shield size={14} /> Pending DNS
                          </span>
                        )}
                      </td>

                      {/* Timeline */}
                      <td style={{ verticalAlign: "middle", fontSize: 11.5, color: "var(--muted)" }}>
                        <div>Req: {new Date(req.requestedAt).toLocaleDateString()}</div>
                        {req.publishedAt && (
                          <div style={{ color: "#10b981" }}>
                            Live: {new Date(req.publishedAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right", paddingRight: 16, verticalAlign: "middle" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "nowrap",
                          }}
                        >
                          {/* DNS Instructions Button */}
                          <button
                            onClick={() => setDnsModalReq(req)}
                            className="btn btn-outline btn-xs"
                            title="View DNS Records and Live Verification"
                            style={{ fontSize: 11.5 }}
                          >
                            DNS Records
                          </button>

                          {/* Quick Verify */}
                          <button
                            onClick={() => handleVerifyDns(req.id)}
                            className="btn btn-outline btn-xs"
                            disabled={isBusy}
                            title="Test DNS Resolution Now"
                            style={{ fontSize: 11.5 }}
                          >
                            {isBusy ? (
                              <RefreshCw size={12} className="spin" />
                            ) : (
                              "Verify"
                            )}
                          </button>

                          {/* Map Page button */}
                          <button
                            onClick={() => {
                              setMapModalReq(req);
                              setSelectedMapPageId(req.landingPageId || "");
                              setSelectedMapProjectId(req.projectId || "");
                            }}
                            className="btn btn-outline btn-xs"
                            title="Map or change landing page"
                            style={{ fontSize: 11.5 }}
                          >
                            Map Page
                          </button>

                          {/* Publish / Unpublish button */}
                          {req.status === "connected" ? (
                            <button
                              onClick={() => handleUnpublish(req.id)}
                              className="btn btn-outline btn-xs"
                              disabled={isBusy}
                              style={{ fontSize: 11.5, color: "#f59e0b" }}
                            >
                              Unpublish
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePublish(req.id)}
                              className="btn btn-primary btn-xs"
                              disabled={
                                isBusy ||
                                req.status === "pending" ||
                                req.status === "rejected" ||
                                req.isSuspended ||
                                !req.landingPageId
                              }
                              title={
                                !req.landingPageId
                                  ? "Map a landing page first"
                                  : req.status === "pending"
                                  ? "Awaiting Super Admin approval"
                                  : "Publish this domain to serve public visitors"
                              }
                              style={{ fontSize: 11.5 }}
                            >
                              Publish Live
                            </button>
                          )}

                          {/* Live Preview Link */}
                          {req.status === "connected" && !req.isSuspended && (
                            <a
                              href={`https://${req.customDomain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-outline btn-xs"
                              title="Visit live custom domain"
                              style={{ padding: "4px 6px" }}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => setDeleteModalReq(req)}
                            className="btn btn-outline btn-xs"
                            style={{
                              color: "#f43f5e",
                              borderColor: "transparent",
                              padding: "4px 6px",
                            }}
                            title="Delete custom domain"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL 1: ADD DOMAIN REQUEST --- */}
      {addModalOpen && (
        <Modal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          title="Request New Custom Domain"
        >
          <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              Submit a domain mapping request for Super Admin approval. Once approved,
              you will receive DNS instructions to connect the domain to your platform landing page.
            </p>

            {/* Domain Name */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Domain Name <span style={{ color: "#f43f5e" }}>*</span>
              </label>
              <input
                type="text"
                className="inp"
                placeholder="e.g. ipixxelrealty.com or landing.project.com"
                value={newDomain}
                onChange={(e) => {
                  const val = e.target.value.trim().toLowerCase();
                  setNewDomain(val);
                  const isSub = val.split(".").length > 2;
                  setNewDomainType(isSub ? "subdomain" : "apex");
                }}
                required
                style={{ width: "100%", fontSize: 13 }}
              />
              <span style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, display: "block" }}>
                Enter the bare domain without http:// or https://. Example: ipixxelrealty.com
              </span>
            </div>

            {/* Domain Type & Hostname Preference */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Domain Type
                </label>
                <select
                  className="inp"
                  value={newDomainType}
                  onChange={(e) => setNewDomainType(e.target.value as any)}
                  style={{ width: "100%", fontSize: 13 }}
                >
                  <option value="apex">Root / Apex Domain (e.g. domain.com)</option>
                  <option value="subdomain">Subdomain (e.g. campaign.domain.com)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Preferred Hostname
                </label>
                <select
                  className="inp"
                  value={newPreferredHost}
                  onChange={(e) => setNewPreferredHost(e.target.value)}
                  style={{ width: "100%", fontSize: 13 }}
                >
                  <option value="">{newDomain ? newDomain : "Root Hostname"}</option>
                  {newDomain && !newDomain.startsWith("www.") && (
                    <option value={`www.${newDomain}`}>www.{newDomain}</option>
                  )}
                </select>
              </div>
            </div>


            {/* Landing Page Selection */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Target Landing Page (Optional)
              </label>
              <select
                className="inp"
                value={newLandingPageId}
                onChange={(e) => setNewLandingPageId(e.target.value)}
                style={{ width: "100%", fontSize: 13 }}
              >
                <option value="">-- Select Landing Page --</option>
                {addModalFilteredPages.map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.name} ({lp.status})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, display: "block" }}>
                You can also map or change the target landing page anytime after Super Admin approval.
              </span>
            </div>

            {/* Toggles: Primary domain & WWW Redirect */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "var(--surface-2, rgba(0,0,0,0.02))", borderRadius: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newIsPrimary}
                  onChange={(e) => setNewIsPrimary(e.target.checked)}
                />
                <span>Set as organisation primary domain</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newRedirectWww}
                  onChange={(e) => setNewRedirectWww(e.target.checked)}
                />
                <span>Enable canonical redirect (www ↔ root domain)</span>
              </label>
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Notes for Super Admin (Optional)
              </label>
              <textarea
                className="inp"
                rows={2}
                placeholder="e.g. Main campaign domain for Q4 project launch"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                style={{ width: "100%", fontSize: 13 }}
              />
            </div>

            {/* Ownership confirmation checkbox */}
            <div
              style={{
                border: "1px solid rgba(59, 130, 246, 0.3)",
                background: "rgba(59, 130, 246, 0.05)",
                padding: "10px 12px",
                borderRadius: 8,
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, cursor: "pointer", color: "var(--ink)" }}>
                <input
                  type="checkbox"
                  checked={newOwnershipConfirmed}
                  onChange={(e) => setNewOwnershipConfirmed(e.target.checked)}
                  style={{ marginTop: 2 }}
                  required
                />
                <span>
                  <strong>Domain Ownership Confirmation:</strong> I confirm that our organisation owns and controls this domain name and is authorised to configure its DNS records.
                </span>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="btn btn-outline"
                disabled={addSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={addSubmitting || !newDomain.trim() || !newOwnershipConfirmed}
              >
                {addSubmitting ? "Submitting Request..." : "Submit Domain Request"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* --- MODAL 2: DNS CONFIGURATION & VERIFICATION --- */}
      {dnsModalReq && (
        <Modal
          open={Boolean(dnsModalReq)}
          onClose={() => setDnsModalReq(null)}
          title={`DNS Configuration — ${dnsModalReq.customDomain}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Registrar instructions */}
            <div
              style={{
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 12.5,
                color: "var(--ink)",
              }}
            >
              <div style={{ fontWeight: 600, color: "#3b82f6", marginBottom: 4 }}>
                How to configure DNS at your domain registrar:
              </div>
              <ol style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
                <li>Log in to your domain provider (e.g., Hostinger, GoDaddy, Cloudflare, Namecheap).</li>
                <li>Go to the DNS Management / Zone Editor for <strong>{dnsModalReq.customDomain}</strong>.</li>
                <li>Add the records listed below. Once added, click <strong>&ldquo;Verify DNS Records&rdquo;</strong>.</li>
              </ol>
            </div>

            {/* DNS Records Table */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>Required DNS Records</span>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  TTL: Auto / 3600 (between 60 and 86400)
                </span>
              </div>

              <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, overflow: "hidden" }}>
                <table className="tbl tbl-sm" style={{ width: "100%", margin: 0, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.02)" }}>
                      <th style={{ width: 70 }}>Type</th>
                      <th>Host / Name</th>
                      <th>Value / Points To</th>
                      <th style={{ width: 80, textAlign: "right" }}>Copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dnsModalReq.dnsInstructions ?? []).map((rec, i) => (
                      <tr key={i}>
                        <td>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background:
                                rec.type === "A"
                                  ? "rgba(16, 185, 129, 0.12)"
                                  : rec.type === "TXT"
                                  ? "rgba(139, 92, 246, 0.12)"
                                  : "rgba(59, 130, 246, 0.12)",
                              color:
                                rec.type === "A"
                                  ? "#10b981"
                                  : rec.type === "TXT"
                                  ? "#8b5cf6"
                                  : "#3b82f6",
                            }}
                          >
                            {rec.type}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{rec.host}</td>
                        <td
                          style={{
                            fontFamily: "monospace",
                            wordBreak: "break-all",
                            fontSize: 12,
                          }}
                        >
                          {rec.value}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(rec.value, `dns-${i}`)}
                            className="btn btn-outline btn-xs"
                            style={{ padding: "3px 8px", fontSize: 11 }}
                          >
                            {copiedKey === `dns-${i}` ? (
                              <span style={{ color: "#10b981", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <Check size={11} /> Copied
                              </span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <Copy size={11} /> Copy
                              </span>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live DNS Diagnostic Summary */}
            {dnsModalReq.verificationDetails && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Last DNS Resolution Check:</span>
                  <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                    {new Date(dnsModalReq.verificationDetails.checkedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <span style={{ color: "var(--muted)" }}>Detected IPv4 (A):</span>{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {dnsModalReq.verificationDetails.detectedIps?.length > 0
                        ? dnsModalReq.verificationDetails.detectedIps.join(", ")
                        : "None detected yet"}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)" }}>Expected IPv4:</span>{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {dnsModalReq.verificationDetails.expectedIp || "Platform IP"}
                    </span>
                  </div>
                </div>
                {dnsModalReq.verificationDetails.errors?.length > 0 && (
                  <div style={{ marginTop: 6, color: "#f43f5e", fontSize: 11.5 }}>
                    <strong>Notice:</strong> {dnsModalReq.verificationDetails.errors.join("; ")}
                  </div>
                )}
              </div>
            )}

            {/* SSL Diagnostic Summary */}
            {dnsModalReq.sslDetails && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <ShieldCheck size={14} style={{ color: dnsModalReq.sslStatus === "active" ? "#10b981" : "#f59e0b" }} />
                  <span>SSL HTTPS Status:</span>
                  <span style={{ textTransform: "capitalize", color: dnsModalReq.sslStatus === "active" ? "#10b981" : "#f59e0b" }}>
                    {dnsModalReq.sslStatus}
                  </span>
                </div>
                {dnsModalReq.sslDetails.issuer && (
                  <div style={{ color: "var(--muted)" }}>
                    Issuer: {dnsModalReq.sslDetails.issuer} • Valid until: {new Date(dnsModalReq.sslDetails.validTo).toLocaleDateString()}
                  </div>
                )}
                {dnsModalReq.sslDetails.error && (
                  <div style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 4 }}>
                    {dnsModalReq.sslDetails.error}
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => handleVerifySsl(dnsModalReq.id)}
                className="btn btn-outline"
                disabled={busyId === dnsModalReq.id}
                style={{ fontSize: 12.5 }}
              >
                <Shield size={14} /> Check SSL Endpoint
              </button>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setDnsModalReq(null)}
                  className="btn btn-outline"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyDns(dnsModalReq.id)}
                  className="btn btn-primary"
                  disabled={busyId === dnsModalReq.id}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <RefreshCw size={14} className={busyId === dnsModalReq.id ? "spin" : ""} />
                  {busyId === dnsModalReq.id ? "Verifying..." : "Verify DNS Records"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* --- MODAL 3: MAP DOMAIN TO LANDING PAGE --- */}
      {mapModalReq && (
        <Modal
          open={Boolean(mapModalReq)}
          onClose={() => setMapModalReq(null)}
          title={`Map Domain — ${mapModalReq.customDomain}`}
        >
          <form onSubmit={handleSaveMapping} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              Connect <strong>{mapModalReq.customDomain}</strong> to a published landing page.
            </p>

            {/* Landing Page Selection */}
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Destination Landing Page <span style={{ color: "#f43f5e" }}>*</span>
              </label>
              <select
                className="inp"
                value={selectedMapPageId}
                onChange={(e) => setSelectedMapPageId(e.target.value)}
                required
                style={{ width: "100%", fontSize: 13 }}
              >
                <option value="">-- Choose Landing Page --</option>
                {mapModalFilteredPages.map((lp) => (
                  <option key={lp.id} value={lp.id}>
                    {lp.name} (Status: {lp.status})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, display: "block" }}>
                Only primary landing pages can serve custom domains. Thank-you companion pages are handled automatically.
              </span>
            </div>

            {/* Live URL Preview Card */}
            <div
              style={{
                border: "1px solid var(--line-2)",
                background: "var(--surface)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 12.5,
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: 11.5, marginBottom: 4 }}>
                Public URL Preview:
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Globe size={15} />
                <span>https://{mapModalReq.customDomain}/</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setMapModalReq(null)}
                className="btn btn-outline"
                disabled={mapSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={mapSubmitting || !selectedMapPageId}
              >
                {mapSubmitting ? "Saving Mapping..." : "Save Mapping"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* --- MODAL 4: DELETE CONFIRMATION --- */}
      {deleteModalReq && (
        <Modal
          open={Boolean(deleteModalReq)}
          onClose={() => setDeleteModalReq(null)}
          title="Delete Custom Domain Request"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13, color: "var(--ink)", margin: 0 }}>
              Are you sure you want to remove <strong>{deleteModalReq.customDomain}</strong>?
            </p>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
              This will remove the domain configuration and disconnect public access to the assigned landing page.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setDeleteModalReq(null)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-danger"
                style={{ background: "#f43f5e", color: "#fff", border: "none" }}
              >
                Delete Domain
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
