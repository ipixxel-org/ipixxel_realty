import { redirect } from "next/navigation";
import { RAZORPAY_SETTINGS_HREF } from "@/lib/integrations";

/** Old address of the Razorpay settings; they live under Online payments now. */
export default function OldRazorpayIntegrationPage() {
  redirect(RAZORPAY_SETTINGS_HREF);
}
