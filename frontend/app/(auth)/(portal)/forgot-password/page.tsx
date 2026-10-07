import { ForgotPasswordView } from "@/components/auth/forgot-password-view";

export default function ForgotPasswordPage() {
  return <ForgotPasswordView portal="organisation" defaultEmail="admin@skylinedev.com" />;
}
