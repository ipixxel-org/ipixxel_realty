"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminLiveSessions } from "@/lib/api";
import type { AdminLiveSession } from "@/lib/types";

const POLL_MS = 20_000;

const TH_STYLE = { padding: "8px 0", textAlign: "left" } as const;
const TD_STYLE = { padding: "12px 12px 12px 0" } as const;

function stuckLabel(row: AdminLiveSession): string | null {
  if (row.stuckReason === "errors") return `${row.errorCount} failed submits`;
  if (row.stuckReason === "time") return `Stuck · ${row.minutesOnPage} min`;
  return null;
}

/** Dashboard card: org users online right now, flagging anyone stuck on a task page. */
export function LiveNowCard() {
  const [rows, setRows] = useState<AdminLiveSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getAdminLiveSessions()
        .then((res) => {
          if (!cancelled) setRows(res);
        })
        // Keep the last good list on a failed poll.
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const stuckCount = rows.filter((r) => r.stuck).length;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: "22px 24px",
        border: "1px solid rgba(226, 232, 240, 0.8)",
        boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Live now</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: stuckCount > 0 ? "#b91c1c" : "#64748b" }}>
          {rows.length} online{stuckCount > 0 ? ` · ${stuckCount} stuck` : ""}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #f1f5f9", color: "#94a3b8", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={TH_STYLE}>ORGANISATION</th>
              <th style={TH_STYLE}>USER</th>
              <th style={TH_STYLE}>PHONE</th>
              <th style={TH_STYLE}>PAGE</th>
              <th style={TH_STYLE}>TIME ON PAGE</th>
              <th style={{ ...TH_STYLE, textAlign: "right" }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8" }}>
                  {loaded ? "No organisation users are online right now." : "Loading live sessions..."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const badge = stuckLabel(row);
                return (
                  <tr key={row.sessionId} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={TD_STYLE}>
                      <Link
                        href={`/admin-console/organisation-detail/${row.orgId}`}
                        style={{ textDecoration: "none", color: "#0f172a", fontWeight: 700 }}
                      >
                        {row.orgName}
                      </Link>
                    </td>
                    <td style={TD_STYLE}>
                      <div style={{ color: "#0f172a", fontWeight: 600 }}>{row.userName}</div>
                      {row.role ? <div style={{ fontSize: 11, color: "#64748b" }}>{row.role}</div> : null}
                    </td>
                    <td style={TD_STYLE}>
                      {row.phone ? (
                        <a href={`tel:${row.phone}`} style={{ color: "#0f172a", textDecoration: "none" }}>
                          {row.phone}
                        </a>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...TD_STYLE, color: "#334155" }}>{row.pageLabel}</td>
                    <td style={{ ...TD_STYLE, color: "#334155" }}>
                      {row.minutesOnPage < 1 ? "< 1 min" : `${row.minutesOnPage} min`}
                    </td>
                    <td style={{ padding: "12px 0", textAlign: "right" }}>
                      {badge ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 999,
                            background: "#fee2e2",
                            color: "#b91c1c",
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {badge}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#64748b" }}>Active</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
