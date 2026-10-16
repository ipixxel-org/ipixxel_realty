import type { Metadata } from "next";
import { BannersPreview } from "@/components/billing/walkthrough/banners-preview";

export const metadata: Metadata = { title: "Billing banners · iPixxel Realty" };

export default function Page() {
  return <BannersPreview />;
}
