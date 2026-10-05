"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { dashboardPathFor } from "@/lib/mock/sessions";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleSignInButton, consumeGoogleErrorParam } from "@/components/auth/google-sign-in-button";
import { mapApiFieldErrors } from "@/lib/form-errors";
import { applyThemeVariables } from "@/components/global-theme-provider";

const FIELD_KEYS = ["email", "password"];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("admin@skylinedev.com");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Read the browser-only query string after hydration so the server and
  // client render the same initial markup.
  const [notice, setNotice] = useState<string | null>(null);
  const [portal, setPortal] = useState<{
    name: string;
    logoUrl?: string | null;
    brandColour?: string | null;
    sitePath?: string;
  } | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    const googleErr = consumeGoogleErrorParam();

    if (googleErr) {
      setGeneralError(googleErr);
    }

    if (reason === "org_inactive") {
      setNotice(
        "You were signed out because your organisation's access was changed. Contact your administrator if this is unexpected.",
      );
    } else if (reason === "account_revoked") {
      setNotice(
        "Your account access has been revoked. Please contact your administrator.",
      );
    }
    const host = window.location.host;
    fetch(`/api/public/site/portal/${encodeURIComponent(host)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.name) {
          setPortal(data);
          if (data.brandColour && /^#[0-9a-fA-F]{3,8}$/.test(data.brandColour)) {
            applyThemeVariables(data.brandColour);
          }
        }
      })
      .catch(() => undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneralError(null);
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const session = await login({ email, password, portal: "organisation" });
      const resumeOrgSignup = session.onboarding_step !== "completed";
      if (resumeOrgSignup) {
        // Explicit signal for /register's mount-resume effect: this visit is
        // a real, password-verified "continue my incomplete setup" — as
        // opposed to /register simply being loaded/reloaded while an old
        // access token from some earlier, never-finished signup happens to
        // still be sitting in localStorage. Without this, the wizard can't
        // tell those two apart and used to pop the "Welcome back" dialog on
        // a blank form just because a stale token was present.
        try {
          window.sessionStorage.setItem("register_resume_intent", "1");
        } catch {
          // best-effort — worst case the wizard falls back to a blank form
          // instead of auto-resuming, which is the safe direction to fail in.
        }
        router.push("/register");
        router.refresh();
        return;
      }
      router.push(
        session.must_change_password
          ? "/change-password"
          : dashboardPathFor(session.role),
      );
      router.refresh();
    } catch (err) {
      const { fieldErrors: fe, general } = mapApiFieldErrors(err, FIELD_KEYS);
      setFieldErrors(fe);
      setGeneralError(general);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      variant="organisation"
      brandName={portal?.name}
      logoUrl={portal?.logoUrl}
      eyebrow="Workspace sign in"
      title={portal ? `Sign in to ${portal.name}` : "Welcome back"}
      subtitle={
        portal ? (
          <>
            Use your organisation credentials. After sign-in you will land on your dashboard.
            {portal.sitePath ? (
              <>
                {" "}
                Looking for the public website?{" "}
                <a href={portal.sitePath} style={{ fontWeight: 600 }}>
                  Open landing page
                </a>
              </>
            ) : null}
          </>
        ) : (
          "Org Admin, Managers & Sales — your property pipeline in one login."
        )
      }
      footer={
        <>
          New here? <Link href="/register">Create an organisation</Link>
        </>
      }
    >
      {notice ? (
        <p role="status" className="help" style={{ marginTop: 18, borderColor: "var(--rose-050)", background: "var(--rose-050)", color: "var(--rose)" }}>
          {notice}
        </p>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <GoogleSignInButton
          mode="login"
          portal="organisation"
          text="Sign in with Google"
          disabled={isSubmitting}
          onError={(err) => setGeneralError(err)}
        />
      </div>

      <div className="auth-divider">
        <span>or sign in with email</span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label>Work email</label>
          <input
            className="inp"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((prev) => ({ ...prev, email: "" }));
            }}
            autoComplete="email"
            placeholder="admin@skylinedev.com"
          />
          {fieldErrors.email ? <div className="hint" style={{ color: "var(--rose)" }}>{fieldErrors.email}</div> : null}
        </div>
        <div className="field">
          <label>Password</label>
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((prev) => ({ ...prev, password: "" }));
            }}
            autoComplete="current-password"
            placeholder="••••••••••"
          />
          {fieldErrors.password ? <div className="hint" style={{ color: "var(--rose)" }}>{fieldErrors.password}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <label className="check">
            <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} /> Keep me signed in
          </label>
          <Link href="/forgot-password" style={{ color: "var(--brand)", fontWeight: 600, fontSize: 13.5 }}>
            Forgot password?
          </Link>
        </div>

        {generalError ? (
          <p role="alert" className="help" style={{ color: "var(--rose)", borderColor: "var(--rose-050)", background: "var(--rose-050)", marginBottom: 14 }}>
            {generalError}
          </p>
        ) : null}

        <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in →"}
        </button>
      </form>
    </AuthShell>
  );
}
