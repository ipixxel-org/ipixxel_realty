"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { decodeAccessToken } from "@/lib/session";
import { tryRefresh } from "@/lib/api";

/**
 * Page presence for the Super Admin "Live now" card: tells the backend which
 * org page the user is on, every 30s. Best-effort by design — every failure is
 * swallowed, nothing is awaited by the page, and it deliberately bypasses
 * `apiFetch` so a failed heartbeat can never trigger a token refresh or a
 * forced logout. Sends the pathname and counters only, never form values.
 */

const HEARTBEAT_MS = 30_000;
const ENDPOINT = "/api/presence/heartbeat";
// Same key lib/api.ts stores the access token under.
const ACCESS_TOKEN_KEY = "be.access_token";
const INTERACTION_EVENTS = ["keydown", "click", "scroll", "input"] as const;
// Mock pages — not worth tracking.
const SKIPPED_PREFIXES = ["/org/calling", "/org/whatsapp"];

type PresenceEvent = "enter" | "heartbeat" | "leave";

// Failed submits on the current page; reset on every route change.
let errorCount = 0;

/** Call from a form's submit-error path. Reported with the next heartbeat. */
export function reportPresenceError(): void {
  errorCount += 1;
}

function shouldTrack(pathname: string | null): pathname is string {
  if (!pathname) return false;
  if (pathname.startsWith("/admin-console")) return false;
  const isOrgPage =
    pathname === "/org" ||
    pathname.startsWith("/org/") ||
    pathname === "/org-builder" ||
    pathname.startsWith("/org-builder/");
  if (!isOrgPage) return false;
  return !SKIPPED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Fresh token on every send (picks up refreshes); null for platform users. */
function orgUserToken(): string | null {
  try {
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return null;
    const session = decodeAccessToken();
    if (!session?.orgId || session.roles.includes("super_admin")) return null;
    return token;
  } catch {
    return null;
  }
}

function newSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function usePagePresence(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!shouldTrack(pathname)) return;

    const sessionId = newSessionId();
    let lastInteractionAt = Date.now();
    errorCount = 0;

    const send = (event: PresenceEvent) => {
      try {
        const token = orgUserToken();
        if (!token) return;
        void fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            event,
            route: pathname,
            sessionId,
            visible: document.visibilityState === "visible",
            lastInteractionAt,
            errorCount,
          }),
          // Lets the final "leave" finish while the page is going away.
          keepalive: true,
        })
          .then((res) => {
            // The access token expires while the user sits on one page — the
            // exact case this feature exists for. Renew it through the shared
            // refresh (never a logout) so the next heartbeat goes through.
            if (res.status === 401 && event !== "leave") void tryRefresh();
          })
          .catch(() => undefined);
      } catch {
        // Presence must never break a page.
      }
    };

    const onInteraction = () => {
      lastInteractionAt = Date.now();
    };
    const onPageHide = () => send("leave");

    send("enter");
    const timer = window.setInterval(() => send("heartbeat"), HEARTBEAT_MS);
    for (const name of INTERACTION_EVENTS) {
      window.addEventListener(name, onInteraction, { capture: true, passive: true });
    }
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      for (const name of INTERACTION_EVENTS) {
        window.removeEventListener(name, onInteraction, { capture: true });
      }
      window.removeEventListener("pagehide", onPageHide);
      send("leave");
    };
  }, [pathname]);
}
