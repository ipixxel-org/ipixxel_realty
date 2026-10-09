import type { Metadata } from "next";
import type { ComponentType } from "react";
import { Icon } from "@/components/icons";
import { GoogleAuthSettings } from "@/components/superadmin/google-auth-settings";

export const metadata: Metadata = {
  title: "Social Login · iPixxel Realty Super Admin",
};

/**
 * One settings card per sign-in provider, stacked on this page. Add Microsoft,
 * Apple, etc. by appending an entry with its own self-contained card component.
 */
const SOCIAL_PROVIDERS: { key: string; Settings: ComponentType }[] = [
  { key: "google", Settings: GoogleAuthSettings },
];

export default function SocialLoginPage() {
  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="key" size={14} /> Integrations</div>
          <h1>Social Login</h1>
          <div className="sub">
            Configure third-party sign-in providers for one-click login and organisation registration without .env variables.
          </div>
        </div>
      </div>

      {SOCIAL_PROVIDERS.map(({ key, Settings }) => (
        <Settings key={key} />
      ))}
    </>
  );
}
