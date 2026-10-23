import { notFound, redirect } from "next/navigation";
import { BILLING_V2 } from "@/lib/billing/flag";

/** Old link: moving to Basic is now a plan change. */
export default function Page() {
  if (!BILLING_V2) notFound();
  redirect("/org/settings/billing/move-to-basic");
}
