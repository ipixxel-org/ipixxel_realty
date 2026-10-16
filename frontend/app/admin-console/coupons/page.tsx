import { notFound } from "next/navigation";
import { AdminCouponsPage } from "@/components/billing/admin/admin-pages";
import { BILLING_V2 } from "@/lib/billing/flag";

export default function Page() {
  if (!BILLING_V2) notFound();
  return <AdminCouponsPage />;
}
