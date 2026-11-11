"use client";

import { useSearchParams } from "next/navigation";

/** True when the builder is editing a Super Admin Template (`?scope=template`),
 *  false for an org admin's landing page. Mirrors app/org-builder/page.tsx. */
export function useIsTemplateBuilder(): boolean {
  return useSearchParams().get("scope") === "template";
}
