import { notFound } from "next/navigation";
import { CancelPage } from "@/components/billing/org-pages";
import { BILLING_V2 } from "@/lib/billing/flag";

export default function Page() {
  if (!BILLING_V2) notFound();
  return <CancelPage />;
}
