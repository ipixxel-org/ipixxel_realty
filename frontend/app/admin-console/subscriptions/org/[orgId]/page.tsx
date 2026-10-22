import { notFound } from "next/navigation";
import { AdminSubscriptionDetailPage } from "@/components/billing/admin/admin-pages";
import { BILLING_V2 } from "@/lib/billing/flag";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Page({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Search> }) {
  if (!BILLING_V2) notFound();
  const { orgId } = await params;
  const sp = await searchParams;
  // ?from=package-requests&status=pending… — the list this page was opened from (Back returns there).
  const origin = { from: one(sp.from), status: one(sp.status), plan: one(sp.plan), q: one(sp.q), page: one(sp.page) };
  return <AdminSubscriptionDetailPage orgId={decodeURIComponent(orgId)} origin={origin} />;
}
