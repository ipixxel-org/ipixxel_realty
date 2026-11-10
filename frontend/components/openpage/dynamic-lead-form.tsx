"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import type { CSSProperties } from "react";
import type { FormLeadField, SiteConfig } from "@/lib/openpage/types";
import {
  isFieldDisabled,
  isFieldRequired,
  isFieldVisible,
  logicSetValue,
  withFieldValue,
} from "@/lib/openpage/form-logic";
import { submitLead } from "@/lib/api";
import { composeLeadSource } from "@/lib/lead-display";
import { packDynamicLeadFields } from "@/lib/openpage/resolve-form";
import { fireTrackingLead } from "@/components/openpage/tracking-scripts";
import { bumpTracking } from "@/lib/openpage/tracking";
import { wtField, wtFieldDark, getWidgetTheme } from "@/lib/openpage/widget-theme";
import {
  bumpFormAnalytics,
  collectUtmParams,
  formDupStorageKey,
  LAYOUT_FIELD_TYPES,
  queryFillValues,
  resolveConditionalDownload,
  resolveConditionalRedirect,
  SKIP_LEAD_TYPES,
  startFileDownload,
  submissionFingerprint,
  type ResolvedDownload,
} from "@/lib/openpage/form-runtime";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}
function isValidPhone(v: string): boolean {
  return v.replace(/\D/g, "").length >= 8;
}

function widthStyle(width?: FormLeadField["width"]): CSSProperties {
  if (width === "half") return { width: "calc(50% - 5px)", flex: "1 1 calc(50% - 5px)" };
  if (width === "third") return { width: "calc(33.33% - 7px)", flex: "1 1 calc(33.33% - 7px)" };
  return { width: "100%", flex: "1 1 100%" };
}

function makeCaptcha() {
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 1 + Math.floor(Math.random() * 8);
  return { q: `${a} + ${b}`, a: String(a + b) };
}

export function DynamicLeadForm({
  form,
  live,
  pageId,
  place,
  projectId,
  projectName,
  extraFields,
  variant = "light",
  hideSubmit,
  submitLabel,
  unitId,
  onSuccess,
}: {
  form: SiteConfig["form"];
  live: boolean;
  pageId?: string;
  place: string;
  projectId?: string;
  projectName?: string;
  extraFields?: Record<string, string>;
  variant?: "light" | "dark";
  hideSubmit?: boolean;
  submitLabel?: string;
  unitId?: string;
  onSuccess?: () => void;
}) {
  const wt = getWidgetTheme();
  const allFields = useMemo(
    () => (Array.isArray(form.fields) ? (form.fields.filter(Boolean) as FormLeadField[]) : []),
    [form.fields],
  );
  const formId = form.embed?.id || form.name || place;

  const [values, setValues] = useState<Record<string, string>>(() => queryFillValues(allFields));
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [download, setDownload] = useState<ResolvedDownload | null>(null);
  const [step, setStep] = useState(0);
  const [captcha, setCaptcha] = useState({ q: "3 + 4", a: "7" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const started = useRef(false);
  const submitted = useRef(false);

  useEffect(() => {
    setCaptcha(makeCaptcha());
  }, []);

  useEffect(() => {
    return () => {
      if (started.current && !submitted.current) bumpFormAnalytics(formId, "abandonments");
    };
  }, [formId]);

  useEffect(() => {
    let next = values;
    let changed = false;
    for (const f of allFields) {
      const sv = logicSetValue(f, allFields, values);
      if (sv === undefined) continue;
      const key = f.id || f.label;
      if ((values[key] ?? "") !== sv) {
        next = withFieldValue(next, f, sv);
        changed = true;
      }
    }
    if (changed) setValues(next);
  }, [allFields, values]);

  const visible = allFields.filter((f) => {
    if (f.type === "hidden") return false;
    return isFieldVisible(f, allFields, values);
  });

  const stepIndexes = useMemo(() => {
    if (!form.multiStep) return [0];
    const max = Math.max(
      form.stepCount ?? 1,
      ...visible.map((f) => f.step ?? 0),
      1,
    );
    const present: number[] = [];
    for (let i = 0; i < max; i++) {
      const has = visible.some((f) => (f.step ?? 0) === i && f.type !== "submit");
      if (has) present.push(i);
    }
    return present.length ? present : [0];
  }, [form.multiStep, form.stepCount, visible]);

  const currentStepIndex = stepIndexes[Math.min(step, stepIndexes.length - 1)] ?? 0;
  const stepFields = form.multiStep
    ? visible.filter((f) => (f.step ?? 0) === currentStepIndex)
    : visible;
  const isLastStep = !form.multiStep || step >= stepIndexes.length - 1;
  const hasCustomSubmit = visible.some((f) => f.type === "submit");

  const fieldStyle = (extra?: CSSProperties): CSSProperties => {
    const radius = form.style?.radius;
    const base =
      variant === "dark" ? wtFieldDark(extra, wt) : wtField(extra, wt);
    return {
      ...base,
      ...(typeof radius === "number" ? { borderRadius: radius } : {}),
    };
  };

  const markStarted = () => {
    if (!started.current) {
      started.current = true;
      bumpFormAnalytics(formId, "starts");
    }
  };

  const setField = (f: FormLeadField, value: string) => {
    markStarted();
    setValues((p) => withFieldValue(p, f, value));
  };

  const validateFields = (list: FormLeadField[]): boolean => {
    for (const f of list) {
      if (LAYOUT_FIELD_TYPES.has(String(f.type)) || f.type === "submit" || f.type === "captcha") continue;
      const required = isFieldRequired(f, allFields, values);
      const key = f.id || f.label;
      const v = (values[key] ?? "").trim();
      const msg = f.validation?.customMessage || form.errorMessage;
      if (required && !v && f.type !== "checkbox" && f.type !== "consent") {
        setError(msg || `${f.label} is required.`);
        return false;
      }
      if (required && (f.type === "checkbox" || f.type === "consent") && v !== "yes") {
        setError(msg || `${f.label} is required.`);
        return false;
      }
      if (v && f.type === "email" && !isValidEmail(v)) {
        setError(f.validation?.customMessage || "Please enter a valid email address.");
        return false;
      }
      if (v && f.type === "phone" && !isValidPhone(v)) {
        setError(f.validation?.customMessage || "Please enter a valid phone number.");
        return false;
      }
      if (v && f.validation?.pattern) {
        try {
          if (!new RegExp(f.validation.pattern).test(v)) {
            setError(f.validation.customMessage || `${f.label} is invalid.`);
            return false;
          }
        } catch {
          /* ignore bad regex */
        }
      }
      if (v && f.validation?.minLength && v.length < f.validation.minLength) {
        setError(f.validation.customMessage || `${f.label} is too short.`);
        return false;
      }
      if (v && f.validation?.maxLength && v.length > f.validation.maxLength) {
        setError(f.validation.customMessage || `${f.label} is too long.`);
        return false;
      }
      if (f.type === "number" && v) {
        const n = Number(v);
        if (f.validation?.min != null && n < f.validation.min) {
          setError(f.validation.customMessage || `${f.label} is too small.`);
          return false;
        }
        if (f.validation?.max != null && n > f.validation.max) {
          setError(f.validation.customMessage || `${f.label} is too large.`);
          return false;
        }
      }
    }
    return true;
  };

  const finishSuccess = () => {
    submitted.current = true;
    bumpFormAnalytics(formId, "submissions");
    const file = resolveConditionalDownload(form, values);
    setDownload(file);
    if (file && form.pdf?.autoDownload !== false) {
      startFileDownload(file);
    }
    const redirect = resolveConditionalRedirect(
      form.redirectRules,
      values,
      form.successAction === "url" ? form.successUrl : "",
    );
    if (redirect && typeof window !== "undefined") {
      window.location.href = redirect;
      return;
    }
    if (typeof window !== "undefined" && (form.successAction === "thankyou" || form.redirectThankYou)) {
      const pathname = window.location.pathname.replace(/\/+$/, "");
      if (pathname && !pathname.endsWith("-thank-you") && !pathname.endsWith("/thank-you")) {
        window.location.href = `${pathname}/thank-you`;
        return;
      }
    }
    setDone(true);
    onSuccess?.();
  };

  const submit = async () => {
    if (!validateFields(stepFields)) return;
    if (!isLastStep) {
      setError("");
      setStep((s) => s + 1);
      return;
    }
    if (!validateFields(visible)) return;

    const captchaNeeded = form.captchaEnabled || allFields.some((f) => f.type === "captcha");
    if (captchaNeeded && captchaAnswer.trim() !== captcha.a) {
      setError("Please complete the CAPTCHA.");
      return;
    }

    const fp =
      form.preventDuplicate && typeof window !== "undefined"
        ? submissionFingerprint(values)
        : "";
    if (form.preventDuplicate && typeof window !== "undefined" && fp && fp !== "|") {
      const key = formDupStorageKey(formId, fp);
      if (window.sessionStorage.getItem(key)) {
        setError("This form was already submitted.");
        return;
      }
    }

    setError("");
    setSubmitting(true);
    const packed = packDynamicLeadFields(
      allFields.filter((f) => !SKIP_LEAD_TYPES.has(String(f.type))),
      values,
    );
    const utm = collectUtmParams();
    const leadFields = {
      ...packed,
      ...utm,
      ...(extraFields ?? {}),
    };
    if (projectName) {
      leadFields.Project = projectName;
      leadFields.project = projectName;
    }
    const payload = {
      formName: form.name || place,
      fields: leadFields,
      notifyEmail: form.notifyEmail,
      autoReplySubject: form.autoReplySubject,
      autoReplyBody: form.autoReplyBody,
    };
    try {
      if (!pageId) {
        throw new Error("This page is missing an ID, so leads cannot be saved. Open Preview or a published URL.");
      }
      const shouldSaveCrm =
        form.saveToCrm !== false && form.integrations?.crm !== false;
      if (!shouldSaveCrm) {
        throw new Error("Save to CRM is disabled on this form. Enable it in Form settings.");
      }

      fireTrackingLead();
      bumpTracking(pageId, "form");
      await submitLead({
        landingPageId: pageId,
        projectId,
        formName: form.name || place,
        source: composeLeadSource({
          place,
          project: projectName,
          interest: leadFields.interestedIn,
        }),
        fields: leadFields,
        unitId,
      });
      if (form.preventDuplicate && typeof window !== "undefined" && fp && fp !== "|") {
        window.sessionStorage.setItem(formDupStorageKey(formId, fp), "1");
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("prestate:lead-success"));
      }

      const eventName = form.integrations?.analyticsEvent;
      if (eventName && typeof window !== "undefined" && typeof (window as any).gtag === "function") {
        (window as any).gtag("event", eventName);
      }
      const hooks = [form.webhookUrl, form.integrations?.googleSheetsUrl].filter(Boolean) as string[];
      for (const url of hooks) {
        try {
          void fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            mode: "no-cors",
            keepalive: true,
          });
        } catch {
          /* webhook best-effort */
        }
      }
      finishSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    const ink = variant === "dark" ? "#ffffff" : form.style?.textColor || wt.ink || "#0f172a";
    const thankYouBg = variant === "dark" ? "rgba(16, 185, 129, 0.16)" : "#f0fdf4";
    const thankYouBorder = variant === "dark" ? "rgba(16, 185, 129, 0.35)" : "#bbf7d0";
    return (
      <div style={{ fontSize: 14, color: ink, lineHeight: 1.6 }}>
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            background: thankYouBg,
            border: `1px solid ${thankYouBorder}`,
            color: variant === "dark" ? "#6ee7b7" : "#15803d",
            fontWeight: 700,
            fontSize: 14,
            marginBottom: download ? 12 : 0,
          }}
        >
          {form.successTitle || form.thankYou || "Thanks — our team will call you shortly."}
        </div>
        {download ? (
          <div style={{ marginTop: 12 }}>
            {download.kind === "image" ? (
              <img src={download.url} alt="" style={{ maxWidth: "100%", borderRadius: 10, marginBottom: 10 }} />
            ) : null}
            <a
              href={download.url}
              download={download.filename}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 10,
                background: form.style?.buttonColor || wt.primary,
                color: "#fff",
                fontWeight: 800,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              {download.label}
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  const labelColor = form.style?.textColor || (variant === "dark" ? "#cbd5e1" : wt.slate);
  const errorBg = variant === "dark" ? "rgba(248,113,113,.12)" : "#fef2f2";
  const progress = form.multiStep && form.progressBar !== false
    ? Math.round(((step + 1) / stepIndexes.length) * 100)
    : 0;

  const renderControl = (f: FormLeadField) => {
    const key = f.id || f.label;
    const val = values[key] ?? "";
    const required = isFieldRequired(f, allFields, values);
    const disabled = isFieldDisabled(f, allFields, values);
    const type = String(f.type);

    if (type === "heading") {
      return <div style={{ fontSize: 16, fontWeight: 800, color: labelColor }}>{f.label}</div>;
    }
    if (type === "html") {
      const cleanHtml = DOMPurify.sanitize(f.html || f.label || "");
      return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
    }
    if (type === "submit") {
      return (
        <button
          type="submit"
          disabled={submitting || disabled}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: form.style?.radius ?? 10,
            border: "none",
            background: form.style?.buttonColor || wt.primary,
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting || disabled ? 0.7 : 1,
          }}
        >
          {submitting ? "Submitting…" : f.label || submitLabel || form.submitLabel || "Submit"}
        </button>
      );
    }
    if (type === "select") {
      return (
        <select
          required={required}
          disabled={disabled}
          value={val}
          onChange={(e) => setField(f, e.target.value)}
          style={fieldStyle(variant === "dark" ? { background: "rgba(15,23,42,.95)" } : undefined)}
        >
          <option value="">{f.placeholder || "Choose"}</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    if (type === "radio") {
      return (
        <div role="radiogroup" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {(f.options ?? []).map((o) => (
            <label key={o} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, color: labelColor }}>
              <input type="radio" name={key} checked={val === o} disabled={disabled} onChange={() => setField(f, o)} />
              {o}
            </label>
          ))}
        </div>
      );
    }
    if (type === "textarea" || type === "address") {
      return (
        <textarea
          required={required}
          disabled={disabled}
          placeholder={f.placeholder}
          value={val}
          onChange={(e) => setField(f, e.target.value)}
          style={fieldStyle({ minHeight: 80 })}
        />
      );
    }
    if (type === "checkbox" || type === "consent") {
      return (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: labelColor }}>
          <input
            type="checkbox"
            required={required}
            disabled={disabled}
            checked={val === "yes"}
            onChange={(e) => setField(f, e.target.checked ? "yes" : "")}
          />
          {f.label}
          {required ? " *" : ""}
        </label>
      );
    }
    if (type === "file") {
      return (
        <input
          type="file"
          disabled={disabled}
          onChange={(e) => setField(f, e.target.files?.[0]?.name ?? "")}
          style={fieldStyle()}
        />
      );
    }
    if (type === "captcha") {
      return (
        <div>
          <div style={{ fontSize: 12, marginBottom: 6, color: labelColor }}>What is {captcha.q}?</div>
          <input
            type="text"
            value={captchaAnswer}
            onChange={(e) => setCaptchaAnswer(e.target.value)}
            placeholder="Answer"
            style={fieldStyle()}
          />
        </div>
      );
    }
    return (
      <input
        type={
          type === "email"
            ? "email"
            : type === "phone"
              ? "tel"
              : type === "number"
                ? "number"
                : type === "date"
                  ? "date"
                  : type === "time"
                    ? "time"
                    : type === "datetime"
                      ? "datetime-local"
                      : "text"
        }
        required={required}
        disabled={disabled}
        placeholder={f.placeholder}
        value={val}
        onChange={(e) => setField(f, e.target.value)}
        style={fieldStyle()}
      />
    );
  };

  const captchaOnForm = stepFields.some((f) => f.type === "captcha");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="prestate-form"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        background: form.style?.background || undefined,
        color: form.style?.textColor || undefined,
        padding: form.style?.background ? 12 : undefined,
        borderRadius: form.style?.radius,
      }}
    >
      {form.multiStep && form.progressBar !== false ? (
        <div style={{ width: "100%" }}>
          <div style={{ height: 6, borderRadius: 99, background: variant === "dark" ? "rgba(255,255,255,.12)" : "#e5e7eb" }}>
            <div style={{ width: `${progress}%`, height: "100%", borderRadius: 99, background: form.style?.buttonColor || wt.primary }} />
          </div>
          <div style={{ fontSize: 11, marginTop: 4, color: labelColor }}>
            Step {step + 1} of {stepIndexes.length}
          </div>
        </div>
      ) : null}

      {stepFields.map((f, i) => {
        const key = f.id || f.label;
        const type = String(f.type);
        return (
          <div key={f.id || key || i} className={f.cssClass} style={widthStyle(f.width)}>
            {type !== "checkbox" && type !== "consent" && type !== "heading" && type !== "html" && type !== "submit" ? (
              <label style={{ fontSize: 11.5, fontWeight: 700, color: labelColor, marginBottom: 5, display: "block" }}>
                {f.label}
                {isFieldRequired(f, allFields, values) ? " *" : ""}
              </label>
            ) : null}
            {renderControl(f)}
            {f.helpText ? (
              <div style={{ fontSize: 11, color: labelColor, opacity: 0.75, marginTop: 4 }}>{f.helpText}</div>
            ) : null}
          </div>
        );
      })}

      {form.captchaEnabled && !captchaOnForm && isLastStep ? (
        <div style={widthStyle("full")}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: labelColor, marginBottom: 5, display: "block" }}>
            CAPTCHA
          </label>
          <div style={{ fontSize: 12, marginBottom: 6, color: labelColor }}>What is {captcha.q}?</div>
          <input
            type="text"
            value={captchaAnswer}
            onChange={(e) => setCaptchaAnswer(e.target.value)}
            placeholder="Answer"
            style={fieldStyle()}
          />
        </div>
      ) : null}

      {error ? (
        <div style={{ width: "100%", padding: "8px 10px", borderRadius: 8, background: errorBg, color: "#dc2626", fontSize: 12.5, fontWeight: 600 }}>
          {error}
        </div>
      ) : null}

      {hideSubmit || hasCustomSubmit ? null : (
        <div style={{ width: "100%", display: "flex", gap: 8 }}>
          {form.multiStep && step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setStep((s) => Math.max(0, s - 1));
              }}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: form.style?.radius ?? 10,
                border: "1px solid #cbd5e1",
                background: "transparent",
                color: labelColor,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Back
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4,
              flex: 2,
              width: "100%",
              padding: "12px 16px",
              borderRadius: form.style?.radius ?? 10,
              border: "none",
              background: form.style?.buttonColor || wt.primary,
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Submitting…" : isLastStep ? submitLabel || form.submitLabel || "Submit" : "Continue"}
          </button>
        </div>
      )}
    </form>
  );
}
