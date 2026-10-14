import type { Metadata } from "next";
import { AdminWalkthrough } from "@/components/billing/walkthrough/walkthroughs";

export const metadata: Metadata = { title: "Billing walkthrough · iPixxel Realty Super Admin" };

export default function Page() {
  return <AdminWalkthrough />;
}
