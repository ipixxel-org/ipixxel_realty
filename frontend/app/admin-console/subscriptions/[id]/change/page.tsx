"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SUBS_PATH } from "../../subscriptions-shared";

// Upgrade / change subscription is now a popup on the Subscriptions studio
// (see change-subscription-modal.tsx). Old links to this page land there and
// open the popup for the same subscription.
export default function ChangeSubscriptionRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  useEffect(() => {
    router.replace(id ? `${SUBS_PATH}?change=${encodeURIComponent(id)}` : SUBS_PATH);
  }, [id, router]);

  return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
}
