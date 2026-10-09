import type { IconName } from "@/components/icons";

/**
 * Super Admin console → Integrations. One entry per third-party connection;
 * the landing grid, the sidebar's visibility check and the breadcrumb are all
 * driven from this list. To add a provider: add an entry here, add its page
 * under app/admin-console/integrations/<key>/, and (once it has settings)
 * report it from GET /admin/integrations/status.
 */
export type IntegrationKey = "smtp" | "social-login" | "razorpay";

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
};

export type IntegrationStatus = {
  key: IntegrationKey;
  configured: boolean;
  active: boolean;
};

export const INTEGRATIONS_HREF = "/admin-console/integrations";

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
    key: "razorpay",
    name: "Razorpay",
    crumb: "Razorpay",
    description: "Payment gateway for organisation subscriptions.",
    icon: "billing",
    tone: "ic-violet",
    href: `${INTEGRATIONS_HREF}/razorpay`,
    // Placeholder until the gateway is built; revisit (likely admin_subscriptions).
    permission: "admin_settings",
    statusSource: null,
    comingSoon: true,
  },
];
