"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { COUNTRY_META } from "@/lib/countries";
import { callingCodeForCountry, splitStoredPhone } from "@/lib/phone";
import { SETTINGS_ACTIONS } from "@/lib/permissions";
import {
  MOBILE_MAX_DIGITS,
  contactFieldForServerError,
  sanitizeMobileDigits,
  validateMobile,
} from "@/lib/contact-validation";
import {
  Field,
  FormActions,
  FormAlert,
  FormGrid,
  FormPage,
  PasswordField,
  PhoneInput,
  SelectInput,
  TextInput,
  formPageStyles,
} from "@/components/forms/form-page";

// My profile — the signed-in member's own account, opened from the header's
// user menu. Separate from Organisation Settings. Mirrors the Users edit form
// minus the role; email and country are read-only. Gated by the Settings
// "My profile: View / Edit" pills (GET / PATCH /org/profile).

const NAME_MAX = 100;
const PASSWORD_MIN = 6;
const FALLBACK_COUNTRY = "India";

// A <fieldset disabled> greys out every control for a view-only member.
const READ_ONLY_FIELDSET: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0 };

interface OwnProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
  country: string | null;
  role: { key: string; name: string } | null;
}

interface FormState {
  firstName: string;
  lastName: string;
  country: string;
  phoneNumber: string; // national digits only — the dial code comes from `country`
  password: string;
}

type FieldKey = "firstName" | "lastName" | "phoneNumber" | "password";
type FieldErrors = Partial<Record<FieldKey, string>>;

function knownCountry(name: string | null | undefined): string {
  return name && COUNTRY_META[name] ? name : "";
}

function validate(f: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!f.firstName.trim()) errors.firstName = "First name is required.";
  else if (f.firstName.trim().length > NAME_MAX) errors.firstName = `Max ${NAME_MAX} characters.`;
  if (!f.lastName.trim()) errors.lastName = "Last name is required.";
  else if (f.lastName.trim().length > NAME_MAX) errors.lastName = `Max ${NAME_MAX} characters.`;
  const mobile = validateMobile(f.country, f.phoneNumber, { required: true });
  if (mobile.phoneNumber || mobile.country) errors.phoneNumber = mobile.phoneNumber ?? mobile.country;
  if (f.password.trim() && f.password.trim().length < PASSWORD_MIN) {
    errors.password = `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  return errors;
}

export default function MyProfilePage() {
  const router = useRouter();
  const { accessToken, isLoading, user: sessionUser, hasPermission, updateProfile } = useAuth();
  const canView = hasPermission("settings", SETTINGS_ACTIONS.viewMyProfile);
  const canEdit = hasPermission("settings", SETTINGS_ACTIONS.editMyProfile);
  const fallbackCountry =
    knownCountry(sessionUser?.organisation?.country) || knownCountry(sessionUser?.country) || FALLBACK_COUNTRY;

  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && accessToken && !canView) router.replace("/org");
  }, [isLoading, accessToken, canView, router]);

  const toForm = useCallback(
    (p: OwnProfile): FormState => {
      const { country, nationalNumber } = splitStoredPhone(p.phoneNumber);
      return {
        firstName: p.firstName ?? "",
        lastName: p.lastName ?? "",
        // A legacy number saved without a dial code can't tell us its country.
        country: country || knownCountry(p.country) || fallbackCountry,
        phoneNumber: nationalNumber,
        password: "",
      };
    },
    [fallbackCountry],
  );

  useEffect(() => {
    if (!accessToken || !canView) return;
    let cancelled = false;
    apiFetch<OwnProfile>("/org/profile")
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setForm(toForm(p));
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load your profile.");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView, toForm]);

  const callingCode = useMemo(() => (form ? callingCodeForCountry(form.country) : null), [form]);

  function setField<K extends FieldKey>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    setNotice(null);
  }

  function discard() {
    if (!profile) return;
    setForm(toForm(profile));
    setErrors({});
    setFormError(null);
    setNotice(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || saving || !canEdit) return;
    setFormError(null);
    setNotice(null);
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError("Please fix the highlighted fields.");
      return;
    }

    const password = form.password.trim() || undefined;
    setSaving(true);
    try {
      const saved = await apiFetch<OwnProfile>("/org/profile", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          // E.164 with no separators — the only shape the API accepts.
          phoneNumber: `${callingCode ?? ""}${form.phoneNumber}`,
          password,
        }),
      });
      setProfile(saved);
      setForm(toForm(saved));
      updateProfile({
        first_name: saved.firstName,
        last_name: saved.lastName,
        phone_number: saved.phoneNumber,
      });
      setNotice(
        password
          ? "Profile saved. Your new password is active and has been emailed to you."
          : "Profile saved.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save your profile.";
      if (contactFieldForServerError(message) === "phoneNumber") {
        setErrors((prev) => ({ ...prev, phoneNumber: message }));
        setFormError("Please fix the highlighted fields.");
      } else {
        setFormError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !canView) return <div className="muted" style={{ padding: 24 }}>Loading…</div>;

  return (
    <FormPage
      eyebrow="Account"
      title="My profile"
      subtitle={canEdit ? "Update your name, mobile number or password." : "Your basic account details."}
      backHref="/org"
      backLabel="Back to Dashboard"
    >
      {loadError ? <FormAlert message={loadError} /> : null}
      {!loadError && (!form || !profile) ? <p className="muted">Loading your profile…</p> : null}
      {form && profile ? (
        <form className={formPageStyles.panel} onSubmit={handleSave} noValidate>
          <FormAlert message={formError} />
          {notice ? (
            <div
              role="status"
              style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "#ecfdf5", color: "#047857", fontSize: 13 }}
            >
              {notice}
            </div>
          ) : null}

          <fieldset disabled={!canEdit || saving} style={READ_ONLY_FIELDSET}>
            <FormGrid>
              <Field htmlFor="mp-first" label="First name *" icon="profile" error={errors.firstName}>
                <TextInput
                  id="mp-first"
                  icon="profile"
                  value={form.firstName}
                  maxLength={NAME_MAX}
                  autoComplete="given-name"
                  invalid={!!errors.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                />
              </Field>
              <Field htmlFor="mp-last" label="Last name *" icon="profile" error={errors.lastName}>
                <TextInput
                  id="mp-last"
                  icon="profile"
                  value={form.lastName}
                  maxLength={NAME_MAX}
                  autoComplete="family-name"
                  invalid={!!errors.lastName}
                  onChange={(e) => setField("lastName", e.target.value)}
                />
              </Field>
            </FormGrid>

            <Field htmlFor="mp-email" label="Work email" icon="mail" hint="Your sign-in email can't be changed here.">
              <TextInput id="mp-email" icon="mail" type="email" value={profile.email} disabled readOnly />
            </Field>

            <FormGrid>
              <Field htmlFor="mp-country" label="Country" icon="globe">
                <SelectInput id="mp-country" value={form.country} disabled>
                  <option value={form.country}>
                    {form.country} ({callingCode ?? "—"})
                  </option>
                </SelectInput>
              </Field>
              <Field
                htmlFor="mp-phone"
                label="Mobile number *"
                icon="phone"
                error={errors.phoneNumber}
                hintId="mp-phone-hint"
                hint={`Digits only, up to ${MOBILE_MAX_DIGITS}. The country code is added automatically.`}
              >
                <PhoneInput
                  id="mp-phone"
                  prefix={callingCode ?? "+--"}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={MOBILE_MAX_DIGITS}
                  value={form.phoneNumber}
                  invalid={!!errors.phoneNumber}
                  aria-describedby="mp-phone-hint"
                  onChange={(e) => setField("phoneNumber", sanitizeMobileDigits(e.target.value))}
                />
              </Field>
            </FormGrid>

            {canEdit ? (
              <Field htmlFor="mp-password" label="New password" note="(optional)" icon="lock" error={errors.password}>
                <PasswordField
                  id="mp-password"
                  value={form.password}
                  invalid={!!errors.password}
                  onChange={(e) => setField("password", e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </Field>
            ) : null}
          </fieldset>

          {canEdit ? (
            <FormActions
              onCancel={discard}
              busy={saving}
              busyLabel="Saving…"
              submitLabel="Save changes"
            />
          ) : null}
        </form>
      ) : null}
    </FormPage>
  );
}
