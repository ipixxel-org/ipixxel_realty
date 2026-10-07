"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { mapApiFieldErrors } from "@/lib/form-errors";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";

const FIELD_KEYS = ["email", "password"];

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Surface the reason a live session was force-ended (see forceSessionEnd in
  // lib/api.ts) — e.g. a Super Admin disabled this Platform Team member while
  // they were signed in.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "account_revoked") {
      setNotice(
        "Your account access has been revoked. Please contact your administrator.",
      );
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneralError(null);
    setFieldErrors({});
    setNotice(null);
    setIsSubmitting(true);
    try {
      const session = await login({ email, password, portal: "platform" });
      if (session.org_id) {
        setGeneralError(
          "This account belongs to an organisation workspace. Please use the organisation sign-in.",
        );
        return;
      }
      // First login with emailed credentials — the forced password-change flow
      // (shared with the Org user first-login flow) must complete before the
      // console is reachable; the backend blocks it until then regardless.
      if (session.must_change_password) {
        router.push("/change-password");
        router.refresh();
        return;
      }
      router.push("/admin-console");
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
      variant="platform"
      eyebrow="Platform"
      title="Welcome back"
      subtitle="Sign in with your platform credentials."
      footer={
        <>
          Organisation user? <Link href="/login">Sign in</Link>
        </>
      }
    >
      {notice ? (
        <p
          role="status"
          className="help"
          style={{
            marginTop: 18,
            borderColor: "var(--rose-050)",
            background: "var(--rose-050)",
            color: "var(--rose)",
          }}
        >
          {notice}
        </p>
      ) : null}

      <form style={{ marginTop: 24 }} onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label>Email</label>
          <input
            className="inp"
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((prev) => ({ ...prev, email: "" }));
            }}
            placeholder="admin@bigestate.io"
            autoComplete="email"
          />
          {fieldErrors.email ? (
            <div className="hint" style={{ color: "var(--rose)" }}>
              {fieldErrors.email}
            </div>
          ) : null}
        </div>

        <div className="field">
          <label>Password</label>
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((prev) => ({ ...prev, password: "" }));
            }}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          {fieldErrors.password ? (
            <div className="hint" style={{ color: "var(--rose)" }}>
              {fieldErrors.password}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <Link
            href="/admin-login/forgot-password"
            style={{ color: "var(--brand)", fontWeight: 600, fontSize: 13.5 }}
          >
            Forgot password?
          </Link>
        </div>

        {generalError ? (
          <p
            role="alert"
            className="help"
            style={{
              color: "var(--rose)",
              borderColor: "var(--rose-050)",
              background: "var(--rose-050)",
              marginBottom: 14,
            }}
          >
            {generalError}
          </p>
        ) : null}

        <button
          className="btn btn-primary btn-block btn-lg"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in…" : "Sign in →"}
        </button>
      </form>
    </AuthShell>
  );
}
