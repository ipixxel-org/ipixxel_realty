"use client";

import { usePagePresence } from "@/hooks/usePagePresence";

/** Mount once per layout that wraps org pages. Renders nothing. */
export function PresenceTracker() {
  usePagePresence();
  return null;
}
