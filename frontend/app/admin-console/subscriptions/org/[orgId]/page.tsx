import { notFound } from "next/navigation";
import { AdminSubscriptionDetailPage } from "@/components/billing/admin/admin-pages";
import { BILLING_V2 } from "@/lib/billing/flag";

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  if (!BILLING_V2) notFound();
  const { orgId } = await params;
  return <AdminSubscriptionDetailPage orgId={decodeURIComponent(orgId)} />;
}
