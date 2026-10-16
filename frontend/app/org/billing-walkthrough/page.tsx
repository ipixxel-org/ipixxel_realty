import type { Metadata } from "next";
import { CustomerWalkthrough } from "@/components/billing/walkthrough/walkthroughs";

export const metadata: Metadata = { title: "Billing walkthrough · iPixxel Realty" };

export default function Page() {
  return <CustomerWalkthrough />;
}
