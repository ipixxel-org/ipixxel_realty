import type { FormLeadField } from "./types";

export const SKIP_LEAD_TYPES = new Set(["heading", "html", "submit", "captcha"]);

export const LAYOUT_FIELD_TYPES = new Set(["heading", "html"]);

export function collectUtmParams(search = typeof window !== "undefined" ? window.location.search : ""): Record<string, string> {
  const params = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ref", "source"]) {
    const v = params.get(key);
    if (v) out[key] = v;
  }
  if (typeof window !== "undefined") {
    try {
      const stored = window.sessionStorage.getItem("crm.attribution.v1");
      const prev = stored ? (JSON.parse(stored) as Record<string, string>) : {};
      const merged = { ...prev, ...out };
      if (document.referrer && !merged.referrer) {
        merged.referrer = document.referrer;
      }
      if (window.location.href) {
        merged.landing_page_url = merged.landing_page_url || window.location.href;
      }
      window.sessionStorage.setItem("crm.attribution.v1", JSON.stringify(merged));
      return merged;
    } catch {
      /* ignore quota */
    }
  }
  return out;
}

/** Read persisted attribution for form submit (UTM + referrer). */
export function getStoredAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.sessionStorage.getItem("crm.attribution.v1");
    const prev = stored ? (JSON.parse(stored) as Record<string, string>) : {};
    const live = collectUtmParams(window.location.search);
    return {
      ...prev,
      ...live,
      ...(document.referrer ? { referrer: document.referrer } : {}),
      landing_page_url: window.location.href,
    };
  } catch {
    return collectUtmParams();
  }
}

export function queryFillValues(fields: FormLeadField[], search = typeof window !== "undefined" ? window.location.search : ""): Record<string, string> {
  const params = new URLSearchParams(search);
  const values: Record<string, string> = {};
  for (const f of fields) {
    const key = f.id || f.label;
    if (f.defaultValue) values[key] = String(f.defaultValue);
    if (f.queryParam) {
      const q = params.get(f.queryParam);
      if (q) values[key] = q;
    }
  }
  return values;
}

export function formDupStorageKey(formId: string, fingerprint: string): string {
  return `prestate.formdup.${formId}.${fingerprint}`;
}

export function submissionFingerprint(values: Record<string, string>): string {
  const phone = Object.entries(values).find(([k]) => /phone|mobile/i.test(k))?.[1] ?? "";
  const email = Object.entries(values).find(([k]) => /email/i.test(k))?.[1] ?? "";
  return `${String(email).trim().toLowerCase()}|${String(phone).replace(/\D/g, "")}`;
}

export type FormLocalAnalytics = { starts: number; submissions: number; abandonments: number };

const FORM_ANALYTICS_KEY = "prestate.form.analytics.v1";

export function getFormAnalytics(formId: string): FormLocalAnalytics {
  if (typeof window === "undefined" || !formId) return { starts: 0, submissions: 0, abandonments: 0 };
  try {
    const raw = window.localStorage.getItem(FORM_ANALYTICS_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Partial<FormLocalAnalytics>>) : {};
    const prev = all[formId];
    return {
      starts: prev?.starts ?? 0,
      submissions: prev?.submissions ?? 0,
      abandonments: prev?.abandonments ?? 0,
    };
  } catch {
    return { starts: 0, submissions: 0, abandonments: 0 };
  }
}

export function bumpFormAnalytics(formId: string, key: keyof FormLocalAnalytics) {
  if (typeof window === "undefined" || !formId) return;
  const all = (() => {
    try {
      const raw = window.localStorage.getItem(FORM_ANALYTICS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Partial<FormLocalAnalytics>>) : {};
    } catch {
      return {} as Record<string, Partial<FormLocalAnalytics>>;
    }
  })();
  const prev = all[formId];
  const cur: FormLocalAnalytics = {
    starts: prev?.starts ?? 0,
    submissions: prev?.submissions ?? 0,
    abandonments: prev?.abandonments ?? 0,
  };
  cur[key] += 1;
  all[formId] = cur;
  try {
    window.localStorage.setItem(FORM_ANALYTICS_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

export function conversionRate(a: FormLocalAnalytics): number {
  if (!a.starts) return 0;
  return Math.round((a.submissions / a.starts) * 1000) / 10;
}

export function ruleValueMatches(
  valRaw: string,
  op: string | undefined,
  cmpRaw: string,
): boolean {
  const val = String(valRaw ?? "").trim();
  const cmp = String(cmpRaw ?? "").trim();
  switch (op || "eq") {
    case "eq":
      return val === cmp;
    case "neq":
      return val !== cmp;
    case "contains":
      return val.toLowerCase().includes(cmp.toLowerCase());
    case "notcontains":
      return !val.toLowerCase().includes(cmp.toLowerCase());
    case "gt":
      return Number(val) > Number(cmp);
    case "lt":
      return Number(val) < Number(cmp);
    case "empty":
      return val === "";
    case "notempty":
      return val !== "";
    default:
      return false;
  }
}

export function valueForRuleField(field: string, values: Record<string, string>): string {
  if (!field) return "";
  return String(values[field] ?? "").trim();
}

export function resolveConditionalRedirect(
  rules: Array<{ field: string; op?: string; value: string; url: string }> | undefined,
  values: Record<string, string>,
  fallbackUrl?: string,
): string {
  for (const rule of rules ?? []) {
    if (!rule.url) continue;
    if (ruleValueMatches(valueForRuleField(rule.field, values), rule.op, rule.value)) return rule.url;
  }
  return fallbackUrl ?? "";
}

export type ResolvedDownload = {
  url: string;
  filename: string;
  kind: "pdf" | "image";
  label: string;
};

export function resolveConditionalDownload(
  form: {
    pdf?: { enabled?: boolean; url?: string; filename?: string; kind?: "pdf" | "image" };
    deliverableUrl?: string;
    deliverableLabel?: string;
    downloadRules?: Array<{
      field: string;
      op?: string;
      value: string;
      url: string;
      filename?: string;
      kind?: "pdf" | "image";
      label?: string;
    }>;
  },
  values: Record<string, string>,
): ResolvedDownload | null {
  for (const rule of form.downloadRules ?? []) {
    if (!rule.url) continue;
    if (!ruleValueMatches(valueForRuleField(rule.field, values), rule.op, rule.value)) continue;
    const kind = rule.kind || (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(rule.url) ? "image" : "pdf");
    return {
      url: rule.url,
      filename: rule.filename || (kind === "image" ? "download.jpg" : "download.pdf"),
      kind,
      label: rule.label || (kind === "image" ? "Download image" : "Download PDF"),
    };
  }
  const pdf = form.pdf;
  if (pdf?.enabled && pdf.url) {
    const kind = pdf.kind || (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(pdf.url) ? "image" : "pdf");
    return {
      url: pdf.url,
      filename: pdf.filename || (kind === "image" ? "download.jpg" : "brochure.pdf"),
      kind,
      label: kind === "image" ? "Download image" : "Download PDF",
    };
  }
  if (form.deliverableUrl) {
    const kind = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(form.deliverableUrl) ? "image" : "pdf";
    return {
      url: form.deliverableUrl,
      filename: kind === "image" ? "download.jpg" : "brochure.pdf",
      kind,
      label: form.deliverableLabel || (kind === "image" ? "Download image" : "Download PDF"),
    };
  }
  return null;
}

export function startFileDownload(file: ResolvedDownload) {
  if (typeof document === "undefined" || !file.url) return;
  const a = document.createElement("a");
  a.href = file.url;
  a.download = file.filename || "";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
