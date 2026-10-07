"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Import leads from CSV is now a popup on the Lead Center (see
// components/org/import-leads-modal.tsx). Old links to this page land there
// and open the popup; the Lead Center applies the same permission check.
export default function ImportLeadsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/org/leads?import=1");
  }, [router]);

  return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
}
