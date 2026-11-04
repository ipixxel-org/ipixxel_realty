"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { getOrgMarketingSyncLogs } from "@/lib/api";
import type { MarketingSyncLog } from "@/lib/types";
import "@/app/org/org.css";

export default function AdminMarketingSyncLogsPage() {
  const [logs, setLogs] = useState<MarketingSyncLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrgMarketingSyncLogs(100)
      .then(setLogs)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load logs"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="org" style={{ background: "transparent" }}>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13, fontWeight: 600 }}>
            <Icon name="integrations" size={14} /> Super Admin · Connected Apps
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
            Integration &amp; Sync Logs
          </h1>
          <p className="muted" style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Real-time webhook and sync delivery events for Super Admin connected social channels.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-secondary" href="/admin-console/marketing/apps">
            ← Back to Connected Apps
          </Link>
          <Link className="btn btn-primary" href="/admin-console/marketing">
            Platform Credentials
          </Link>
        </div>
      </div>

      {error ? (
        <div className="form-alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      ) : null}

      <Reveal>
        <div className="card">
          <div className="card-h">
            <span className="t">Recent Sync Events</span>
            <span className="x">{logs.length} events logged</span>
          </div>
          <div className="card-b" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                Loading integration logs…
              </div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
                No sync events recorded yet. Connect an account and run a sync to see logs.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Platform</th>
                      <th>Direction</th>
                      <th>Status</th>
                      <th>Message / Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const isOk = log.status === "success" || log.status === "ok";
                      return (
                        <tr key={log.id}>
                          <td className="muted" style={{ fontSize: 12 }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td style={{ textTransform: "capitalize", fontWeight: 600 }}>
                            {log.platformKey}
                          </td>
                          <td style={{ textTransform: "capitalize" }}>
                            {log.direction || "Inbound"}
                          </td>
                          <td>
                            <span className={`badge ${isOk ? "b-emerald" : "b-rose"}`}>
                              {isOk ? "Success" : "Failed"}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: "#334155" }}>
                            {log.message || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
