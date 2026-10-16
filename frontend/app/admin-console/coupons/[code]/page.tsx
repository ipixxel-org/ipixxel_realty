import { notFound } from "next/navigation";
import { AdminCouponUsagePage } from "@/components/billing/admin/admin-pages";
import { BILLING_V2 } from "@/lib/billing/flag";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  if (!BILLING_V2) notFound();
  const { code } = await params;
  return <AdminCouponUsagePage code={decodeURIComponent(code)} />;
}
