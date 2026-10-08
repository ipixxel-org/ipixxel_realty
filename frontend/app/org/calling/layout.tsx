import type { ReactNode } from "react";
import { ComingSoon } from "@/components/org/coming-soon";

// [DISABLED-CALLING] Every /org/calling/** route renders this placeholder
// instead of its (mock, hardcoded) page. The pages themselves are untouched;
// to restore, delete this layout (or render `children` again) and search the
// repo for [DISABLED-CALLING]. The real CallLog model and the sales-agents
// stats that read it are unaffected.
export default function CallingDisabledLayout({ children }: { children: ReactNode }) {
  void children;
  return (
    <ComingSoon
      title="Calling"
      icon="phone"
      description="Calling, queues and AI agents are coming soon."
    />
  );
}
