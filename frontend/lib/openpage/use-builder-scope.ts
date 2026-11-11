"use client";

import { useSearchParams } from "next/navigation";

/** True when the builder is editing a Super Admin Template (`?scope=template`),
 *  false for an org admin's landing page. Mirrors app/org-builder/page.tsx. */
export function useIsTemplateBuilder(): boolean {
  // useSearchParams() can be null outside the App Router (e.g. in tests).
  return useSearchParams()?.get("scope") === "template";
}
