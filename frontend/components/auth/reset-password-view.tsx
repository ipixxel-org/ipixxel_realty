"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, validateResetToken } from "@/lib/api";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";

type Portal = "organisation" | "platform";

function portalPaths(portal: Portal) {
  return portal === "platform"
    ? { login: "/admin-login", forgot: "/admin-login/forgot-password" }
    : { login: "/login", forgot: "/forgot-password" };
}

function ResetForm({ portal }: { portal: Portal }) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const paths = portalPaths(portal);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<"checking" | "valid" | "invalid">(
    token ? "checking" : "invalid",
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    validateResetToken(token)
      .then((res) => {
        if (!cancelled) setTokenStatus(res.valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setTokenStatus("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("Missing or invalid reset token. Request a new link.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiFetch<{ success: boolean }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, new_password: password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      variant={portal}
      eyebrow={portal === "platform" ? "Platform · Account recovery" : "Account recovery"}
      title="Set a new password"
      subtitle="Choose a fresh, strong password and you'll be back in the pipeline in seconds."
      footer={
        <>
          ← Back to <Link href={paths.login}>Sign in</Link>
        </>
      }
    >
      {tokenStatus === "checking" ? (
        <div className="help" style={{ marginTop: 22 }}>
          Checking your reset link…
        </div>
      ) : tokenStatus === "invalid" ? (
        <div className="help" style={{ marginTop: 22, color: "var(--rose)", borderColor: "var(--rose-050)", background: "var(--rose-050)" }}>
          ⚠️ This reset link is invalid or has expired. Please{" "}
          <Link href={paths.forgot} style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}>
            request a new one
          </Link>.
        </div>
      ) : done ? (
        <div className="help" style={{ marginTop: 22 }}>
          ✅ Password updated. You can now{" "}
          <Link href={paths.login} style={{ fontWeight: 600 }}>sign in</Link>.
        </div>
      ) : (
        <form style={{ marginTop: 24 }} onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label>New password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••••"
            />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••••"
            />
          </div>
          {error ? (
            <div className="help" style={{ color: "var(--rose)", borderColor: "var(--rose-050)", background: "var(--rose-050)", marginBottom: 14 }}>
              {error}
            </div>
          ) : null}
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordView({ portal }: { portal: Portal }) {
  return (
    <Suspense
      fallback={
        <AuthShell variant={portal} eyebrow="Account recovery" title="Set a new password">
          <p className="muted" style={{ marginTop: 22 }}>Loading…</p>
        </AuthShell>
      }
    >
      <ResetForm portal={portal} />
    </Suspense>
  );
}
