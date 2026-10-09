import { redirect } from "next/navigation";

// Email & SMTP moved under Integrations; keep old bookmarks working.
export default function LegacyEmailPage() {
  redirect("/admin-console/integrations/smtp");
}
