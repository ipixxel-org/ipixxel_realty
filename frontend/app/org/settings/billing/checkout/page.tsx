import { notFound } from "next/navigation";
import { CheckoutPage } from "@/components/billing/org-pages";
import { BILLING_V2 } from "@/lib/billing/flag";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Search }) {
  if (!BILLING_V2) notFound();
  const q = await searchParams;
  return <CheckoutPage plan={one(q.plan)} interval={one(q.interval)} renew={one(q.renew)} coupon={one(q.coupon)} pick={one(q.pick)} />;
}
