import type { ReactNode } from "react";
import { ComingSoon } from "@/components/org/coming-soon";

// [DISABLED-TEAMS] Every /org/teams/** route renders this placeholder instead
// of its page — the backend module is switched off too (app.module.ts). The
// pages themselves are untouched; to restore, delete this layout (or render
// `children` again) and search the repo for [DISABLED-TEAMS].
export default function TeamsDisabledLayout({ children }: { children: ReactNode }) {
  void children;
  return (
    <ComingSoon
      title="Teams"
      icon="team"
      description="Teams is currently unavailable."
    />
  );
}
