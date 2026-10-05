"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { authenticateWithGoogle } from "@/lib/api";
import { dashboardPathFor } from "@/lib/mock/sessions";
import {
  GOOGLE_OAUTH_NONCE_KEY,
  GOOGLE_SIGNUP_KEY,
  type GoogleSignupPrefill,
} from "@/components/auth/google-sign-in-button";

type OAuthState = {
  mode?: "login" | "register";
  portal?: "organisation" | "platform";
  nonce?: string;
};

// A Google authorization code can be exchanged exactly once. React's dev
// StrictMode runs effects twice, and the second exchange would fail with
// invalid_grant and bounce a user who actually signed in fine — so remember
// which codes this page load already started on.
const startedCodes = new Set<string>();

function decodeState(raw: string): OAuthState | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as OAuthState;
  } catch {
    return null;
  }
}

// The nonce stays until a sign-in succeeds (or the next button click
// replaces it), so retrying after a failed attempt — e.g. Back to Google's
// account picker — isn't rejected. An attacker never knows it either way.
function readStoredNonce(): string | null {
  try {
    return window.sessionStorage.getItem(GOOGLE_OAUTH_NONCE_KEY);
  } catch {
    return null;
  }
}

// Where a finished sign-in sent this tab, keyed by its code. If the callback
// page is loaded again with the same code (dev-server reload, Back), it just
// goes there again instead of failing the already-cleared nonce check.
const GOOGLE_OAUTH_DONE_KEY = "google_oauth_done";

function readFinished(code: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_OAUTH_DONE_KEY);
    const done = raw ? (JSON.parse(raw) as { code?: string; target?: string }) : null;
    return done?.code === code && done.target ? done.target : null;
  } catch {
    return null;
  }
}

function markFinished(code: string, target: string) {
  try {
    window.sessionStorage.setItem(GOOGLE_OAUTH_DONE_KEY, JSON.stringify({ code, target }));
    window.sessionStorage.removeItem(GOOGLE_OAUTH_NONCE_KEY);
  } catch {}
}

export default function GoogleCallbackPage() {
  const router = useRouter();
  const { loginWithGoogle } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const rawState = params.get("state");
    const state = rawState ? decodeState(rawState) : null;
    const mode = state?.mode === "register" ? "register" : "login";
    const portal = state?.portal === "platform" ? "platform" : "organisation";

    const fail = (message: string) => {
      router.replace(`/${mode}?google_error=${encodeURIComponent(message)}`);
    };

    const googleError = params.get("error");
    if (googleError) {
      fail(
        googleError === "access_denied"
          ? "Google sign in was cancelled."
          : `Google sign in failed: ${googleError}`,
      );
      return;
    }

    if (!code || !rawState) {
      fail("Google sign in did not complete. Please try again.");
      return;
    }

    if (startedCodes.has(code)) return;
    startedCodes.add(code);

    const finishedTarget = readFinished(code);
    if (finishedTarget) {
      router.replace(finishedTarget);
      return;
    }

    // Reject any callback this browser didn't start (login CSRF: a crafted
    // link carrying an attacker's code would otherwise sign the victim into
    // the attacker's account).
    const expectedNonce = readStoredNonce();
    if (!state || !expectedNonce || state.nonce !== expectedNonce) {
      console.warn(
        "[google-callback] state check failed:",
        !state ? "state undecodable" : !expectedNonce ? "no stored nonce in this tab" : "nonce mismatch",
      );
      fail("Google sign in could not be verified. Please try again.");
      return;
    }

    void (async () => {
      try {
        const res = await authenticateWithGoogle({
          code,
          // Must match the redirect_uri the code was issued for.
          redirectUri: `${window.location.origin}/auth/google/callback`,
          mode,
          portal,
        });

        switch (res.status) {
          case "authenticated":
          case "exists_incomplete":
          case "created": {
            if (!("access_token" in res) || !res.user) {
              throw new Error("An account with this email already exists. Please sign in with your password.");
            }
            const onboardingIncomplete = res.status !== "authenticated";
            const session = await loginWithGoogle({
              user: res.user,
              access_token: res.access_token,
              refresh_token: res.refresh_token,
              roles: "roles" in res ? res.roles : [],
              onboarding_incomplete: onboardingIncomplete,
            });
            let target: string;
            if (onboardingIncomplete) {
              try {
                window.sessionStorage.setItem("register_resume_intent", "1");
              } catch {}
              target = "/register";
            } else {
              target = session.must_change_password
                ? "/change-password"
                : dashboardPathFor(session.role);
            }
            markFinished(code, target);
            router.replace(target);
            return;
          }

          case "needs_profile":
          case "not_found": {
            const prefill: GoogleSignupPrefill = {
              email: res.email,
              firstName: res.firstName,
              lastName: res.lastName,
              googleToken: "googleToken" in res ? res.googleToken : undefined,
            };
            try {
              window.sessionStorage.setItem(GOOGLE_SIGNUP_KEY, JSON.stringify(prefill));
            } catch {}
            markFinished(code, "/register");
            router.replace("/register");
            return;
          }

          case "exists_completed":
            throw new Error(res.message || "An account with this email is already registered.");
        }
      } catch (err: unknown) {
        fail(err instanceof Error ? err.message : "Google authentication failed");
      }
    })();
  }, [loginWithGoogle, router]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0c1220",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        role="status"
        style={{
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          padding: "32px 40px",
          textAlign: "center",
          maxWidth: 420,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            border: "3px solid rgba(255, 255, 255, 0.2)",
            borderTopColor: "#38bdf8",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
          Signing you in…
        </h2>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
          Please wait while we complete your Google sign-in.
        </p>
      </div>
    </div>
  );
}
