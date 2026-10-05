"use client";

import { useState } from "react";
import { getGoogleAuthUrl } from "@/lib/api";

/** sessionStorage key for the OAuth state nonce, checked by /auth/google/callback. */
export const GOOGLE_OAUTH_NONCE_KEY = "google_oauth_nonce";

/**
 * sessionStorage key the callback page uses to hand a brand-new Google
 * user's details (and the short-lived signup token) to /register — kept out
 * of the URL so the token never lands in history or server logs.
 */
export const GOOGLE_SIGNUP_KEY = "google_signup";

export interface GoogleSignupPrefill {
  email: string;
  firstName: string;
  lastName: string;
  googleToken?: string;
}

/**
 * Reads ?google_error= (set by the callback page on failure) and removes it
 * from the address bar, so a reload doesn't show a stale error again.
 */
export function consumeGoogleErrorParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("google_error");
  if (error === null) return null;
  params.delete("google_error");
  const qs = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}`,
  );
  return error;
}

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
        fill="#34A853"
      />
      <path
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
        fill="#EA4335"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  mode?: "login" | "register";
  portal?: "organisation" | "platform";
  text?: string;
  disabled?: boolean;
  onError?: (error: string) => void;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Starts Google's OAuth redirect flow. The result is handled by
 * app/(auth)/(portal)/auth/google/callback, not by the page hosting this button.
 */
export function GoogleSignInButton({
  mode = "login",
  portal = "organisation",
  text,
  disabled = false,
  onError,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleGoogleClick() {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const nonce = randomNonce();
      window.sessionStorage.setItem(GOOGLE_OAUTH_NONCE_KEY, nonce);
      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const res = await getGoogleAuthUrl(mode, portal, redirectUri, nonce);
      if (!res.url) throw new Error("Google sign in is not available right now");
      window.location.href = res.url;
      // Leave the spinner up — the page is navigating away.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google OAuth is not configured on server";
      onError?.(msg);
      setLoading(false);
    }
  }

  const label =
    text ||
    (mode === "register" ? "Sign up with Google" : "Continue with Google");

  return (
    <button
      type="button"
      className="btn-google"
      onClick={() => void handleGoogleClick()}
      disabled={disabled || loading}
      aria-label={label}
    >
      {loading ? (
        <span className="btn-google-spinner" aria-hidden="true" />
      ) : (
        <GoogleIcon size={18} />
      )}
      <span>{loading ? "Connecting to Google…" : label}</span>
    </button>
  );
}
