import type { ReactNode } from "react";
import { ComingSoon } from "@/components/org/coming-soon";

// [DISABLED-WHATSAPP] Every /org/whatsapp/** route renders this placeholder
// instead of its (mock, hardcoded) page. The pages themselves are untouched;
// to restore, delete this layout (or render `children` again) and search the
// repo for [DISABLED-WHATSAPP].
export default function WhatsAppDisabledLayout({ children }: { children: ReactNode }) {
  void children;
  return (
    <ComingSoon
      title="WhatsApp"
      icon="mail"
      description="WhatsApp inbox and automations are coming soon."
    />
  );
}
