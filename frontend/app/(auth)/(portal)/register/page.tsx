/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Icon, type IconName } from "@/components/icons";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { Modal } from "@/components/ui/modal";
import { mapApiFieldErrors } from "@/lib/form-errors";
import {
  createOrganisationStep,
  previewDraft,
  resumeExistingDraft,
  resumeSignup,
  restartExistingDraft,
  signupStep1,
  verifyEmail,
  resendVerification,
} from "@/lib/api";
import {
  GOOGLE_SIGNUP_KEY,
  GoogleSignInButton,
  consumeGoogleErrorParam,
  type GoogleSignupPrefill,
} from "@/components/auth/google-sign-in-button";
import { callingCodeForCountry, validatePhoneForCountry } from "@/lib/phone";
import type { OnboardingStep, OrgIndustry, ResumeSignupResponse } from "@/lib/types";
import { COUNTRY_META, COUNTRIES } from "@/lib/countries";

const FIELD_KEYS = [
  "first_name",
  "last_name",
  "company_name",
  "work_email",
  "phone_number",
  "city",
  "country",
  "password",
];

// On-screen labels for the Step 1 required-field check, so the
// "… is required" message reads like the field's label (capitalised)
// instead of the raw snake_case key ("first name is required").
const STEP1_FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  work_email: "Work email",
  country: "Country",
  phone_number: "Mobile number",
  password: "Password",
};

// Simplified wizard — just Account and Organisation. Every other step
// (Business Details, Subscription, Templates, Modules, Invite, Connect) was
// removed: City and Terms of Service moved into Organisation; the rest have
// in-app equivalents post-signup (Org Settings, Templates page, Users page)
// or, for Connect, were never implemented in the first place.
const STEPS = [
  { n: 1, label: "Your account", sub: "Admin login" },
  { n: 2, label: "Organisation", sub: "Name, city & type" },
];
const TOTAL = STEPS.length;

// Mirrors backend/src/common/utils/onboarding.util.ts's ONBOARDING_STEP_ORDER
// exactly — used only to translate a resumed draft's onboardingStep into a
// human label for the "you already started this" popup. The enum itself
// keeps every historical value (see onboarding.util.ts's own comment); a
// step past index 1 here means the draft is legacy and the backend
// self-heals it straight to 'completed' the moment it's touched (see
// AuthService.finalizeLegacyOnboardingDraft), so completedStepLabel below
// falls back to a generic label rather than describing a step this wizard
// no longer shows.
const ONBOARDING_ORDER: OnboardingStep[] = [
  "account",
  "organisation",
  "business_details",
  "subscription",
  "templates",
  "modules",
  "invite",
  "connect",
  "completed",
];

function completedStepLabel(step: OnboardingStep): string {
  const idx = ONBOARDING_ORDER.indexOf(step);
  return STEPS[idx]?.label ?? "your account";
}

// The step-1 Mobile field holds just the national number the user typed
// (see updatePhoneNumber below); what's persisted server-side is the
// fully-qualified "+<code> <digits>" string. Strip the calling code back
// off so a resumed draft's phone re-populates that same national-only field
// instead of showing the dial code baked into the digits.
function stripCallingCode(storedNumber: string, callingCode: string | null): string {
  const digits = storedNumber.replace(/\D/g, "");
  const codeDigits = (callingCode ?? "").replace(/\D/g, "");
  if (codeDigits && digits.startsWith(codeDigits)) {
    return digits.slice(codeDigits.length);
  }
  return digits;
}

const ORG_TYPES: { v: string; ic: IconName; b: string; s: string }[] = [
  { v: "developer", ic: "building", b: "Developer", s: "Build & sell own projects" },
  { v: "broker", ic: "users", b: "Broker / Agency", s: "Sell others' inventory" },
  { v: "channel", ic: "link", b: "Channel Partner", s: "Refer & close deals" },
  { v: "mixed", ic: "building", b: "Mixed", s: "A bit of everything" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { applyAuthTokens, logout, user } = useAuth();

  // The account id this wizard instance has itself confirmed, server-side,
  // is a valid not-yet-completed draft — via signupStep1's own success, the
  // silent mount-resume, or "Continue previous setup" (see applyResumedState
  // and commitStep's Step 1 branch). Intentionally separate from the `user`
  // above: that comes from auth-context/localStorage and can be a stale
  // leftover from an earlier, unrelated visit, which must never be trusted
  // to route a fresh Step 1 submit into resumeExistingDraft.
  const resumedAccountIdRef = useRef<string | null>(null);

  const [cur, setCur] = useState(0);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    company_name: "",
    work_email: "",
    phone_number: "",
    city: "",
    country: "",
    password: "",
  });
  const [orgType, setOrgType] = useState("developer");
  const [teamSize, setTeamSize] = useState("2–10");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once Step 1 reports the email belongs to a *completed* account —
  // stops the wizard cold and points at real sign-in instead.
  const [accountExists, setAccountExists] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sent">("idle");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [resumeAfterVerify, setResumeAfterVerify] = useState<OnboardingStep | null>(null);
  const [resumingDraft, setResumingDraft] = useState(false);
  // Set when Step 1's email or mobile matches someone's still-in-progress
  // signup — the popup asks whether to continue that draft or start fresh
  // with whatever was just typed, see handleContinueDraft/handleStartFreshDraft.
  const [draftCollision, setDraftCollision] = useState<{
    existingUserId: string;
    firstName: string | null;
    lastName: string | null;
    onboardingStep: OnboardingStep;
  } | null>(null);
  const [draftBusy, setDraftBusy] = useState<"resume" | "restart" | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [googleVerified, setGoogleVerified] = useState(false);
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    };
  }

  // Digits only, capped at 15 — the ITU E.164 maximum length for the
  // national number across every country — so the field can't be typed
  // into indefinitely, and what's stored is always a plain digit string
  // (paired with the derived country code prefixed at submit time, see
  // commitStep's Step 1 branch) rather than free text that could contain
  // spaces/dashes and vary between two entries of the "same" number.
  function updatePhoneNumber(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 15);
    setForm((prev) => ({ ...prev, phone_number: digits }));
    setFieldErrors((prev) => ({ ...prev, phone_number: "" }));
  }

  function handleCountryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const country = e.target.value;
    setForm((prev) => ({ ...prev, country }));
    setFieldErrors((prev) => ({ ...prev, country: "" }));
    const meta = COUNTRY_META[country];
    setCurrency(meta?.currencyLabel ?? "");
    setTimezone(meta?.timezone ?? "");
  }

  // Auto-derived from the Step 1 Country selector — shown as a fixed
  // prefix next to Mobile, editable only for the number itself.
  const phoneCallingCode = useMemo(() => callingCodeForCountry(form.country), [form.country]);

  // n is the 1-indexed step being left (matches STEPS[].n: 1 Account, 2 Organisation).
  function validateStep(n: number): boolean {
    setGeneralError(null);
    if (n === 1) {
      const required: (keyof typeof form)[] = ["first_name", "last_name", "work_email", "country", "phone_number"];
      if (!resumingDraft && !googleVerified) required.push("password");
      for (const k of required) {
        if (!form[k]?.trim()) { setGeneralError(`${STEP1_FIELD_LABELS[k] ?? k.replace(/_/g, " ")} is required`); return false; }
      }
      const phoneError = validatePhoneForCountry(form.phone_number, form.country);
      if (phoneError) { setGeneralError(phoneError); return false; }
      if (!resumingDraft && !googleVerified && form.password.length < 8) { setGeneralError("Password must be at least 8 characters"); return false; }
      return true;
    }
    if (n === 2) {
      if (!form.company_name?.trim()) { setGeneralError("Company name is required"); return false; }
      if (!form.city?.trim()) { setGeneralError("City is required"); return false; }
      if (!agreedToTerms) { setGeneralError("You must agree to the Terms of Service & Privacy Policy."); return false; }
      return true;
    }
    return true;
  }

  // Persists whatever tokens a step handed back, so the next step's
  // request already carries the right Authorization header.
  function applyTokens(user: any, tokens: { access_token: string; refresh_token: string }) {
    applyAuthTokens(user, tokens);
  }

  // Each step commits to the backend before the wizard is allowed to move
  // on. Step 2 is now the FINAL step: createOrganisationStep finishes
  // onboarding server-side in the same call (assigns the Basic plan,
  // activates the org, marks onboarding completed) — there is no separate
  // "complete" call anymore.
  async function commitStep(n: number): Promise<boolean> {
    if (n === 1) {
      // This page instance is handling Step 1 itself (fresh signup or a
      // resume, either way via direct user action) — mark the silent
      // mount-resume effect below as already "done" so it can't fire off
      // the back of the user/onboarding_step change applyTokens is about to
      // cause and reset `cur` back to Step 1 out from under a fresh signup
      // that just correctly advanced to Step 2.
      didResumeRef.current = true;

      // This exact wizard instance already confirmed *with the server* that
      // it's resuming a specific not-yet-completed account (mount-resume,
      // "Continue previous setup", or Step 1 already having succeeded once
      // this visit — see the three places that set resumedAccountIdRef).
      // Re-submitting Step 1 in that case must update THAT account
      // (resumeExistingDraft) rather than signupStep1, which would find it
      // by email/phone and treat it as a fresh collision with itself,
      // re-showing the "Welcome back" popup.
      //
      // Deliberately NOT keyed off the `user` from auth context: that can
      // be a stale session left over in this browser from an earlier,
      // unrelated visit (or a since-deleted "start fresh" draft) — trusting
      // it here misrouted a brand new signup into resumeExistingDraft with
      // an existingUserId nothing in the database matches, surfacing "No
      // signup in progress for this account" instead of ever reaching
      // signupStep1's real, server-side email/phone collision check.
      if (resumedAccountIdRef.current) {
        const resumed = await resumeExistingDraft({
          existingUserId: resumedAccountIdRef.current,
          first_name: form.first_name,
          last_name: form.last_name,
          work_email: form.work_email,
          phone_number: phoneCallingCode ? `${phoneCallingCode} ${form.phone_number}` : form.phone_number,
          country: form.country,
        });
        applyTokens(resumed.user, resumed);
        resumedAccountIdRef.current = resumed.user.id;
        if (resumed.email_verification_required || !resumed.user.email_verified_at) {
          setAwaitingVerification(true);
          setVerifyCode("");
          setVerifyError(null);
          startResendCooldown(form.work_email);
          markAwaitingVerification(form.work_email);
          return false;
        }
        return true;
      }

      const passwordToSubmit =
        form.password ||
        (googleVerified
          ? Math.random().toString(36).slice(2) + "A1!" + Math.random().toString(36).slice(2)
          : form.password);

      const res = await signupStep1({
        first_name: form.first_name,
        last_name: form.last_name,
        work_email: form.work_email,
        // form.phone_number holds just the national number the user
        // typed — the country's dial code (derived from the Step 1
        // Country selector) is prefixed here so what's persisted is a
        // fully-qualified number, not just the digits.
        phone_number: phoneCallingCode ? `${phoneCallingCode} ${form.phone_number}` : form.phone_number,
        password: passwordToSubmit,
        country: form.country,
        googleToken: googleToken || undefined,
      });
      if (res.status === "exists_completed") {
        setAccountExists(true);
        setGeneralError("You already have an account with this email — sign in instead.");
        return false;
      }
      if (res.status === "exists_incomplete") {
        // Don't silently resume — that used to discard whatever was just
        // retyped above (see AuthService.resumeExistingDraft). Ask instead.
        setDraftError(null);
        setDraftCollision({
          existingUserId: res.existingUserId,
          firstName: res.firstName,
          lastName: res.lastName,
          onboardingStep: res.onboardingStep,
        });
        return false;
      }
      applyTokens(res.user, res);
      resumedAccountIdRef.current = res.user.id;
      try {
        window.sessionStorage.removeItem(GOOGLE_SIGNUP_KEY);
      } catch {}
      if (res.email_verification_required || !res.user.email_verified_at) {
        setAwaitingVerification(true);
        setVerifyCode("");
        setVerifyError(null);
        startResendCooldown(form.work_email);
        markAwaitingVerification(form.work_email);
        return false;
      }
      return true;
    }

    if (n === 2) {
      const res = await createOrganisationStep({
        company_name: form.company_name,
        industry: orgType as OrgIndustry,
        teamSize,
        city: form.city,
        agreedToTerms,
        country: form.country || undefined,
        currency: COUNTRY_META[form.country]?.currency ?? undefined,
        timezone: timezone || undefined,
      });
      applyTokens(res.user, res);
      return true;
    }

    return true;
  }

  // Shared by handleContinueDraft (and, previously, the old silent-resume
  // branch) — restores every downstream step's local state from whatever
  // the backend has saved for this draft.
  //
  // Restore saved account details and continue at the next step when the
  // account is already verified; unverified drafts stop for verification.
  function applyResumedState(resumed: ResumeSignupResponse) {
    applyTokens(resumed.user, resumed);
    resumedAccountIdRef.current = resumed.user.id;
    setResumingDraft(true);
    // Organisation.country (once Step 2 has run) is the source of truth;
    // before that, fall back to the country captured on the User at Step 1
    // (see User.country's schema comment) — without it, resuming a
    // pre-Step-2 draft had nothing to restore the Country select from, so
    // the phone field rendered the dial code and local number concatenated.
    const resumedCountry = resumed.organisation?.country ?? resumed.user.country ?? form.country;
    const resumedCallingCode = callingCodeForCountry(resumedCountry);
    setForm((prev) => ({
      ...prev,
      first_name: resumed.user.first_name ?? prev.first_name,
      last_name: resumed.user.last_name ?? prev.last_name,
      work_email: resumed.user.email ?? prev.work_email,
      phone_number: resumed.user.phone_number
        ? stripCallingCode(resumed.user.phone_number, resumedCallingCode)
        : prev.phone_number,
      // Never recoverable from its hash, and leaving whatever was typed on
      // the collision attempt sitting here would look like "old" data it
      // isn't — clear it so Step 1 visibly asks for it again.
      password: "",
      company_name: resumed.organisation?.name ?? prev.company_name,
      country: resumedCountry,
      city: resumed.organisation?.city ?? prev.city,
    }));
    if (resumed.organisation) {
      if (resumed.organisation.industry) setOrgType(resumed.organisation.industry);
      if (resumed.organisation.team_size) setTeamSize(resumed.organisation.team_size);
    }
    if (resumed.email_verification_required || !resumed.user.email_verified_at) {
      setAwaitingVerification(true);
      setVerifyCode("");
      setVerifyError(null);
      startResendCooldown(resumed.user.email ?? form.work_email);
      markAwaitingVerification(resumed.user.email ?? form.work_email);
      setResumeAfterVerify(resumed.nextStep);
      return;
    }
    setCur(resumed.user.email_verified_at && resumed.user.onboarding_step === "account" ? 1 : 0);
    window.scrollTo(0, 0);
  }

  const didResumeRef = useRef(false);
  useEffect(() => {
    const gError = consumeGoogleErrorParam();

    if (gError) {
      setGeneralError(gError);
    }
    // Handed over by /auth/google/callback for a Google account with no user
    // yet. Kept until Step 1 succeeds so a refresh doesn't lose it.
    let gPrefill: GoogleSignupPrefill | null = null;
    try {
      const raw = window.sessionStorage.getItem(GOOGLE_SIGNUP_KEY);
      if (raw) gPrefill = JSON.parse(raw) as GoogleSignupPrefill;
    } catch {}
    if (gPrefill?.email) {
      const { email, firstName, lastName, googleToken: gToken } = gPrefill;
      setForm((prev) => ({
        ...prev,
        work_email: email,
        first_name: firstName || prev.first_name,
        last_name: lastName || prev.last_name,
      }));
      // Only the signup token proves the email to the backend — without it
      // Step 1 still needs the normal verification code.
      if (gToken) {
        setGoogleVerified(true);
        setGoogleToken(gToken);
      }
    }

    if (didResumeRef.current) return;
    if (!user || user.role === "super_admin") return;
    if (user.onboarding_step === "completed") return;

    // A reload or dev-mode hot-reload remounts this component, resetting
    // didResumeRef — without this check that looked exactly like a brand
    // new visit and called resumeSignup below, which silently re-issues
    // (and re-emails) a fresh verification code even though the user is
    // just sitting on the "enter your code" screen they were already on.
    // sessionStorage survives the remount, so it's the source of truth for
    // "this tab already has a code out for this email" instead of in-memory
    // state that a remount wipes.
    let alreadyAwaiting = false;
    try {
      alreadyAwaiting = window.sessionStorage.getItem(awaitingVerificationKey(user.email)) === "1";
    } catch {
      alreadyAwaiting = false;
    }
    if (alreadyAwaiting) {
      didResumeRef.current = true;
      resumedAccountIdRef.current = user.id;
      // form resets to blank on every fresh mount — without this, the
      // restored verify screen shows "We sent a code to ." and both Verify
      // and Resend silently operate on an empty email (the DTO's @IsEmail
      // check rejects it, surfacing as "wrong code" / "couldn't resend"
      // even though the code the user has is genuinely correct).
      setForm((prev) => ({
        ...prev,
        first_name: user.first_name ?? prev.first_name,
        last_name: user.last_name ?? prev.last_name,
        work_email: user.email,
      }));
      setAwaitingVerification(true);
      setVerifyCode("");
      setVerifyError(null);
      return;
    }

    // Beyond the in-progress-verification case above, only auto-resume (and
    // pop the "Welcome back" dialog) when /login just explicitly sent us
    // here for THIS reason — a real, password-verified sign-in for an
    // account that hasn't finished onboarding (see login/page.tsx). Without
    // this check, merely loading /register with a stale-but-still-valid
    // access token from some earlier, never-finished signup attempt (no
    // password re-entered, nothing typed) triggered the exact same dialog
    // on a blank form, which read as a bug rather than a deliberate resume.
    // One-shot: consumed immediately so a later plain reload of /register
    // in the same tab doesn't keep re-triggering it.
    let hasResumeIntent = false;
    try {
      hasResumeIntent = window.sessionStorage.getItem("register_resume_intent") === "1";
      if (hasResumeIntent) window.sessionStorage.removeItem("register_resume_intent");
    } catch {
      hasResumeIntent = false;
    }
    if (!hasResumeIntent) return;

    didResumeRef.current = true;
    resumeSignup(user.email)
      .then((resumed) => {
        setDraftCollision({
          existingUserId: resumed.user.id,
          firstName: resumed.user.first_name,
          lastName: resumed.user.last_name,
          onboardingStep: resumed.user.onboarding_step,
        });
      })
      .catch(() => {
        didResumeRef.current = false;
      });
    // Present the same explicit draft choice used by a fresh signup collision
    // when an incomplete user reaches the wizard from login or /org.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.onboarding_step]);

  // 60s resend cooldown, kept in sessionStorage (keyed by email) rather than
  // plain component state — a page refresh mid-cooldown re-reads the same
  // stored deadline instead of handing back a fresh 60s, so the cooldown
  // can't be trivially bypassed by reloading.
  const RESEND_COOLDOWN_MS = 60_000;

  function resendCooldownKey(email: string) {
    return `verify_resend_cooldown:${email.trim().toLowerCase()}`;
  }

  function readResendSecondsLeft(email: string): number {
    if (typeof window === "undefined" || !email) return 0;
    try {
      const raw = window.sessionStorage.getItem(resendCooldownKey(email));
      if (!raw) return 0;
      const endsAt = Number(raw);
      if (!Number.isFinite(endsAt)) return 0;
      return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    } catch {
      return 0;
    }
  }

  function startResendCooldown(email: string) {
    setResendSecondsLeft(Math.ceil(RESEND_COOLDOWN_MS / 1000));
    if (typeof window === "undefined" || !email) return;
    try {
      window.sessionStorage.setItem(resendCooldownKey(email), String(Date.now() + RESEND_COOLDOWN_MS));
    } catch {
      // sessionStorage unavailable (private mode, etc.) — the in-memory
      // state set above still enforces the cooldown for this page view.
    }
  }

  // Marks "this tab already has a verification code out for this email" —
  // separate from the cooldown above, and kept around for as long as the
  // account is unverified (not just 60s). The mount-resume effect below
  // reads this so that a reload/hot-reload of the "enter your code" screen
  // restores that screen locally instead of calling resumeSignup again,
  // which would silently re-issue (and re-email) a fresh code even though
  // nothing the user did asked for one.
  function awaitingVerificationKey(email: string) {
    return `verify_awaiting:${email.trim().toLowerCase()}`;
  }

  function markAwaitingVerification(email: string) {
    if (typeof window === "undefined" || !email) return;
    try {
      window.sessionStorage.setItem(awaitingVerificationKey(email), "1");
    } catch {
      // best-effort — worst case a reload re-triggers the resume flow.
    }
  }

  function clearAwaitingVerification(email: string) {
    if (typeof window === "undefined" || !email) return;
    try {
      window.sessionStorage.removeItem(awaitingVerificationKey(email));
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    if (!awaitingVerification) return;
    setResendSecondsLeft(readResendSecondsLeft(form.work_email));
    const interval = window.setInterval(() => {
      setResendSecondsLeft(readResendSecondsLeft(form.work_email));
    }, 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingVerification, form.work_email]);

  async function handleVerifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifyError(null);
    setVerifyBusy(true);
    try {
      await verifyEmail(form.work_email, verifyCode);
      setAwaitingVerification(false);
      setVerifyCode("");
      clearAwaitingVerification(form.work_email);
      if (resumeAfterVerify) {
        // Same rule as applyResumedState: land back on Step 1 (prefilled),
        // not wherever the resumed draft had reached.
        setCur(0);
        setResumeAfterVerify(null);
      } else {
        setCur((c) => Math.max(c, 1));
      }
      window.scrollTo(0, 0);
    } catch (err) {
      const { general } = mapApiFieldErrors(err, FIELD_KEYS);
      setVerifyError(general ?? "That code doesn't look right. Check it and try again.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleResendVerification() {
    if (resendBusy || resendSecondsLeft > 0) return;
    setVerifyError(null);
    setResendBusy(true);
    try {
      await resendVerification(form.work_email);
      setResendState("sent");
      startResendCooldown(form.work_email);
      window.setTimeout(() => setResendState("idle"), 2000);
    } catch (err) {
      const { general } = mapApiFieldErrors(err, FIELD_KEYS);
      setVerifyError(general ?? "Couldn't resend the code. Please try again.");
    } finally {
      setResendBusy(false);
    }
  }

  // "Continue previous setup" — a read-only preview of the draft exactly as
  // it was saved (ignores whatever was just retyped on this collision
  // attempt) so Step 1 lands back with the OLD data prefilled for review —
  // not the new name/password just typed, and not skipped ahead to
  // whichever step the draft had reached. The person can edit any field
  // (password included — it can't be recovered from its hash, so that one
  // starts blank) and it's only actually saved once they click Continue
  // again, which commitStep's Step 1 branch routes through
  // resumeExistingDraft for exactly this reason.
  async function handleContinueDraft() {
    if (!draftCollision) return;
    setDraftError(null);
    setDraftBusy("resume");
    try {
      const resumed = await previewDraft({ existingUserId: draftCollision.existingUserId });
      applyResumedState(resumed);
      setDraftCollision(null);
    } catch (err) {
      const { general } = mapApiFieldErrors(err, FIELD_KEYS);
      setDraftError(general ?? "Couldn't continue that setup — please try again.");
    } finally {
      setDraftBusy(null);
    }
  }

  // "Start fresh instead" permanently removes the abandoned draft. No new
  // account is created until the user submits the blank Step 1 again, which
  // keeps verification and collision detection on the normal signup path.
  async function handleStartFreshDraft() {
    if (!draftCollision) return;
    setDraftError(null);
    setDraftBusy("restart");
    try {
      const res = await restartExistingDraft({
        existingUserId: draftCollision.existingUserId,
      });
      if (res.status !== "restarted") {
        setDraftError("Couldn't start a fresh setup — please try again.");
        return;
      }
      await logout();
      didResumeRef.current = true;
      resumedAccountIdRef.current = null;
      setResumingDraft(false);
      setAwaitingVerification(false);
      setVerifyCode("");
      setVerifyError(null);
      setResumeAfterVerify(null);
      setForm({
        first_name: "",
        last_name: "",
        company_name: "",
        work_email: "",
        phone_number: "",
        city: "",
        country: "",
        password: "",
      });
      setCurrency("");
      setTimezone("");
      setOrgType("developer");
      setTeamSize("2–10");
      setAgreedToTerms(false);
      setFieldErrors({});
      setGeneralError(null);
      setDraftCollision(null);
      setGoogleVerified(false);
      setGoogleToken(null);
      try {
        window.sessionStorage.removeItem(GOOGLE_SIGNUP_KEY);
      } catch {}
      setCur(0);
      window.scrollTo(0, 0);
    } catch (err) {
      const { general } = mapApiFieldErrors(err, FIELD_KEYS);
      setDraftError(general ?? "Couldn't start a fresh setup — please try again.");
    } finally {
      setDraftBusy(null);
    }
  }

  function go(d: number) {
    if (d < 0) {
      setCur((c) => Math.max(0, c - 1));
      window.scrollTo(0, 0);
      return;
    }
    void goNext();
  }

  async function goNext() {
    const stepNumber = cur + 1;
    if (!validateStep(stepNumber)) return;
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const advance = await commitStep(stepNumber);
      if (advance) {
        setCur((c) => Math.min(TOTAL - 1, c + 1));
        window.scrollTo(0, 0);
      }
    } catch (err) {
      const { fieldErrors: fe, general } = mapApiFieldErrors(err, FIELD_KEYS);
      setFieldErrors(fe);
      setGeneralError(general);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Step 2 is the last step — commitStep(2) both creates the organisation
  // AND finishes onboarding server-side (Basic plan, active status,
  // completed step), so a successful commit here goes straight to the
  // dashboard rather than advancing to a step that no longer exists. There
  // is no "pending approval" holding screen anymore — the approval gate is
  // gone (see backend OrgApprovedGuard).
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cur !== TOTAL - 1) {
      void goNext();
      return;
    }
    const stepNumber = cur + 1;
    if (!validateStep(stepNumber)) return;
    setFieldErrors({});
    setGeneralError(null);
    setIsSubmitting(true);
    try {
      const advance = await commitStep(stepNumber);
      if (advance) {
        router.push("/org");
        router.refresh();
      }
    } catch (err) {
      const { fieldErrors: fe, general } = mapApiFieldErrors(err, FIELD_KEYS);
      setFieldErrors(fe);
      setGeneralError(general ?? "Couldn't finish setup — please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (accountExists) {
    return (
      <AuthShell
        eyebrow="Account"
        title="You already have an account"
        subtitle={
          <>
            An account already exists for <b>{form.work_email}</b>. Sign in instead of registering again.
          </>
        }
        footer={
          <>
            Registering with a different email?{" "}
            <button type="button" onClick={() => setAccountExists(false)} style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 600, cursor: "pointer", font: "inherit", padding: 0 }}>
              Use a different email
            </button>
          </>
        }
      >
        <div className="help" style={{ marginTop: 18 }}>
          This email has already finished workspace setup — head to sign in to continue.
        </div>
        <div style={{ marginTop: 18 }}>
          <Link className="btn btn-primary btn-block btn-lg" href="/login">
            Go to sign in →
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (awaitingVerification) {
    return (
      <AuthShell
        eyebrow="Email verification"
        title="Check your inbox"
        subtitle={
          <>
            We sent a 6-digit code to <b>{form.work_email}</b>. Enter it to activate your account.
          </>
        }
        footer={null}
      >
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          The code expires in 60 minutes.
        </p>
        <form style={{ marginTop: 22 }} onSubmit={handleVerifyEmail} noValidate>
          <div className="field">
            <label>Verification code</label>
            <input
              className="inp"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => {
                setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setVerifyError(null);
              }}
              placeholder="000000"
              aria-label="Verification code"
              style={{ letterSpacing: "0.35em", textAlign: "center", fontWeight: 700 }}
            />
          </div>
          {verifyError ? (
            <p role="alert" className="help" style={{ color: "var(--rose)", borderColor: "var(--rose-050)", background: "var(--rose-050)", marginBottom: 14 }}>
              {verifyError}
            </p>
          ) : null}
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={verifyBusy || verifyCode.length !== 6}>
            {verifyBusy ? "Verifying…" : "Verify email →"}
          </button>
        </form>
        <p className="muted" style={{ textAlign: "center", marginTop: 20, fontSize: 13.5 }}>
          Didn&apos;t receive it?{" "}
          {resendSecondsLeft > 0 ? (
            <span>Resend code in {resendSecondsLeft}s</span>
          ) : (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendBusy}
              style={{ color: "var(--brand)", fontWeight: 600, background: "none", border: "none", cursor: resendBusy ? "default" : "pointer", fontSize: "inherit", font: "inherit" }}
            >
              {resendBusy ? "Sending…" : resendState === "sent" ? "Code re-sent" : "Resend code"}
            </button>
          )}
        </p>
      </AuthShell>
    );
  }

  const isLast = cur === TOTAL - 1;

  return (
    <>
      <AuthShell
        eyebrow={`Step ${cur + 1} of ${TOTAL} · ${STEPS[cur].label}`}
        title={cur === 0 ? "Create your account" : "Your organisation"}
        subtitle={
          cur === 0
            ? "You'll be the organisation admin — set up your login details."
            : "Tell us who you are — we'll tailor the workspace."
        }
        footer={
          <>
            Already have an account? <Link href="/login">Sign in</Link>
            <span style={{ color: "var(--faint)" }}> · 14-day free trial</span>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="fprog">
            <i style={{ width: `${Math.round(((cur + 1) / (TOTAL + 1)) * 100)}%` }} />
          </div>

          {/* STEP 1 — account */}
          <div className={`wpane${cur === 0 ? " on" : ""}`}>
            <div>
              {!resumingDraft ? (
                <div style={{ marginBottom: 14 }}>
                  <GoogleSignInButton
                    mode="register"
                    text="Sign up with Google"
                    onError={(err) => setGeneralError(err)}
                  />
                  <div className="auth-divider">
                    <span>or register with email</span>
                  </div>
                </div>
              ) : null}

              {googleVerified ? (
                <div className="google-verified-badge">
                  <Icon name="check" size={13} />
                  <span>Google Account Verified &bull; {form.work_email}</span>
                </div>
              ) : null}

              <div className="row2">
                <div className="field">
                  <label>First name <span className="req">*</span></label>
                  <input className="inp" value={form.first_name} onChange={update("first_name")} placeholder="Rohan" />
                </div>
                <div className="field">
                  <label>Last name <span className="req">*</span></label>
                  <input className="inp" value={form.last_name} onChange={update("last_name")} placeholder="Shah" />
                </div>
              </div>
              <div className="field">
                <label>Work email <span className="req">*</span></label>
                <input
                  className="inp"
                  type="email"
                  value={form.work_email}
                  onChange={update("work_email")}
                  placeholder="admin@skylinedev.com"
                  readOnly={googleVerified}
                  style={googleVerified ? { background: "#f8fafc", cursor: "default" } : undefined}
                />
                {fieldErrors.work_email ? <div className="hint" style={{ color: "var(--rose)" }}>{fieldErrors.work_email}</div> : null}
              </div>
              <div className="row2">
                <div className="field">
                  <label>Country <span className="req">*</span></label>
                  <select className="inp" value={form.country} onChange={handleCountryChange}>
                    <option value="">Select country…</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Mobile <span className="req">*</span></label>
                  <div className="phone-inp">
                    <span className="cc">{phoneCallingCode ?? "+--"}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={form.phone_number}
                      onChange={updatePhoneNumber}
                      placeholder="98250 41200"
                      aria-label="Mobile number"
                    />
                  </div>
                  {fieldErrors.phone_number ? <div className="hint" style={{ color: "var(--rose)" }}>{fieldErrors.phone_number}</div> : null}
                </div>
              </div>
              {!resumingDraft ? <div className="field" style={{ marginBottom: 0 }}>
                <label>
                  Password {googleVerified ? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span> : <span className="req">*</span>}
                </label>
                <PasswordInput value={form.password} onChange={update("password")} placeholder="••••••••••" autoComplete="new-password" />
                <div className="hint">
                  {googleVerified ? "Leave blank to log in with Google, or set a password." : "Min 8 characters."}
                </div>
                {fieldErrors.password ? <div className="hint" style={{ color: "var(--rose)" }}>{fieldErrors.password}</div> : null}
              </div> : null}
            </div>
          </div>

          {/* STEP 2 — organisation (final step) */}
          <div className={`wpane${cur === 1 ? " on" : ""}`}>
            <div>
              <div className="field">
                <label>What describes you best? <span className="req">*</span></label>
                <div className="cards2" id="orgType">
                  {ORG_TYPES.map((o) => (
                    <div
                      key={o.v}
                      className={`rc${orgType === o.v ? " on" : ""}`}
                      onClick={() => setOrgType(o.v)}
                    >
                      <div className="ic"><Icon name={o.ic} /></div>
                      <b>{o.b}</b>
                      <small>{o.s}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Company name <span className="req">*</span></label>
                <input className="inp" value={form.company_name} onChange={update("company_name")} placeholder="Skyline Developers" />
              </div>
              <div className="row2">
                <div className="field">
                  <label>City <span className="req">*</span></label>
                  <input className="inp" value={form.city} onChange={update("city")} placeholder="Ahmedabad" />
                </div>
                <div className="field">
                  <label>Team size</label>
                  <select className="inp" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                    <option value="Just me">Just me</option>
                    <option value="2–10">2–10</option>
                    <option value="11–50">11–50</option>
                    <option value="50+">50+</option>
                  </select>
                </div>
              </div>
              {!form.country ? (
                // Country now lives on Step 1 — this only appears as a
                // fallback if it somehow wasn't set there (e.g. resuming
                // right after Step 1, before Step 2 ever submitted and
                // persisted it — Step 1 itself isn't shown again on resume).
                <div className="field">
                  <label>Country</label>
                  <select className="inp" value={form.country} onChange={handleCountryChange}>
                    <option value="">Select country…</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <label className="check" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => { setAgreedToTerms(e.target.checked); setGeneralError(null); }}
                  style={{ flexShrink: 0 }}
                />
                I agree to the Terms of Service &amp; Privacy Policy
              </label>
            </div>
          </div>

          {generalError ? (
            <p role="alert" className="help" style={{ color: "var(--rose)", borderColor: "var(--rose-050)", background: "var(--rose-050)", marginTop: 16 }}>
              {generalError}
            </p>
          ) : null}

          <div className="wfoot">
            <button className="btn btn-ghost" type="button" onClick={() => go(-1)} style={{ visibility: cur === 0 ? "hidden" : "visible" }}>← Back</button>
            <div style={{ flex: 1 }} />
            {isLast ? (
              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Finishing setup…" : "🚀 Go to workspace"}
              </button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => go(1)} disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Continue →"}
              </button>
            )}
          </div>
        </form>
      </AuthShell>

      {draftCollision ? (
        <Modal
          open
          onClose={() => setDraftCollision(null)}
          title="Welcome back"
          size="sm"
          closeDisabled={!!draftBusy}
        >
            <p style={{ margin: "0 0 20px", color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.6 }}>
              Looks like {draftCollision.firstName ? <b>{draftCollision.firstName}</b> : "someone"} already
              started setting up a workspace with this email or mobile number — it got as far as{" "}
              <b>{completedStepLabel(draftCollision.onboardingStep)}</b>. Want to continue where that setup
              left off, or start fresh with what you just entered?
            </p>
            {draftError ? (
              <p role="alert" className="help" style={{ color: "var(--rose)", borderColor: "var(--rose-050)", background: "var(--rose-050)", marginBottom: 16 }}>
                {draftError}
              </p>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="btn btn-primary btn-block"
                type="button"
                onClick={handleContinueDraft}
                disabled={!!draftBusy}
              >
                {draftBusy === "resume" ? "Continuing…" : "Continue previous setup →"}
              </button>
              <button
                className="btn btn-ghost btn-block"
                type="button"
                onClick={handleStartFreshDraft}
                disabled={!!draftBusy}
              >
                {draftBusy === "restart" ? "Starting fresh…" : "Start fresh instead"}
              </button>
            </div>
        </Modal>
      ) : null}
    </>
  );
}
