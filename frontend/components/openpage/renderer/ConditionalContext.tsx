"use client";

import { createContext, useContext } from "react";
import type { EvaluationContext } from "@/lib/openpage/conditional-render";

/**
 * Live data available while rendering a published page. Present only in the
 * public renderer (SiteRenderer) — the editor canvas deliberately renders every
 * block so hidden sections can still be selected and edited.
 */
const ConditionalContext = createContext<EvaluationContext | null>(null);

export function ConditionalRenderProvider({
  value,
  children,
}: {
  value: EvaluationContext;
  children: React.ReactNode;
}) {
  return (
    <ConditionalContext.Provider value={value}>
      {children}
    </ConditionalContext.Provider>
  );
}

export function useConditionalContext(): EvaluationContext | null {
  return useContext(ConditionalContext);
}
