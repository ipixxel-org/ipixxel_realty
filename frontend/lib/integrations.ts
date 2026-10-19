import type { IconName } from "@/components/icons";

/**
 * Super Admin console → Integrations. One entry per third-party connection;
 * the landing grid, the sidebar's visibility check and the breadcrumb are all
 * driven from this list. To add a provider: add an entry here, add its page
 * under app/admin-console/integrations/<key>/, and (once it has settings)
 * report it from GET /admin/integrations/status.
 */
export type IntegrationKey = "smtp" | "social-login" | "payments" | "ai";

export type IntegrationDef = {
  key: IntegrationKey;
  name: string;
  /** Short label for the breadcrumb ("Integrations / SMTP"). */
  crumb: string;
  description: string;
  icon: IconName;
  /** Tile colour — one of the console's existing .ic-* classes. */
  tone: "ic-indigo" | "ic-green" | "ic-amber" | "ic-violet" | "ic-sky" | "ic-rose";
  href: string;
  /**
   * Platform permission module that gates this integration's settings. It is
   * the module of the existing endpoints the page calls, so moving a page
   * here never changes who can use it.
   */
  permission: string;
  /**
   * Where the card's status comes from: "api" = the entry with the same `key`
   * in GET /admin/integrations/status. Coming-soon entries have no status.
   */
  statusSource: "api" | null;
  comingSoon?: boolean;
  /** Pages below `href`, for a third breadcrumb level ("Integrations / Payments / Razorpay"). */
  subPages?: { href: string; crumb: string }[];
};

export type IntegrationStatus = {
  key: IntegrationKey;
  configured: boolean;
  active: boolean;
  /** Online payments only: the Super Admin switch (online_payments_enabled). */
  enabled?: boolean;
  /** Online payments only: the gateway with usable keys, or null. */
  gateway?: "razorpay" | null;
};

export const INTEGRATIONS_HREF = "/admin-console/integrations";
/** Integrations → Online payments → Payment gateways. */
export const PAYMENT_GATEWAYS_HREF = `${INTEGRATIONS_HREF}/payments`;
/** The Razorpay settings form (keys, webhook secret, test connection). */
export const RAZORPAY_SETTINGS_HREF = `${PAYMENT_GATEWAYS_HREF}/razorpay`;

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "smtp",
    name: "Email / SMTP",
    crumb: "SMTP",
    description: "Platform mail server for invites, password resets and alerts.",
    icon: "mail",
    tone: "ic-indigo",
    href: `${INTEGRATIONS_HREF}/smtp`,
    permission: "admin_email",
    statusSource: "api",
  },
  {
    key: "social-login",
    name: "Social Login (Google)",
    crumb: "Social Login",
    description: "One-click sign-in and organisation sign-up with Google.",
    icon: "key",
    tone: "ic-sky",
    href: `${INTEGRATIONS_HREF}/social-login`,
    permission: "admin_settings",
    statusSource: "api",
  },
  {
    key: "payments",
    name: "Online payments",
    crumb: "Payments",
    description: "Let organisations pay online. When off, upgrades go to Super Admin for approval.",
    icon: "billing",
    tone: "ic-violet",
    href: PAYMENT_GATEWAYS_HREF,
    // Same module as /admin/payments (the gateway settings). Saving keys is
    // additionally super_admin-only; the switch itself needs admin_settings edit.
    permission: "admin_subscriptions",
    statusSource: "api",
    subPages: [{ href: RAZORPAY_SETTINGS_HREF, crumb: "Razorpay" }],
  },
  {
    key: "ai",
    name: "AI Design Agent",
    crumb: "AI",
    description: "API keys for the OpenPage AI Template builder (Gemini, Claude or a custom agent).",
    icon: "sparkles",
    tone: "ic-indigo",
    href: `${INTEGRATIONS_HREF}/ai`,
    // Same module as the Settings page (admin_settings).
    permission: "admin_settings",
    statusSource: "api",
  },
];
