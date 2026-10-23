import { notFound } from "next/navigation";
import { RequestsPage } from "@/components/billing/org-pages";
import { BILLING_V2 } from "@/lib/billing/flag";

export default function Page() {
  if (!BILLING_V2) notFound();
  return <RequestsPage />;
}
