import { ForgotPasswordView } from "@/components/auth/forgot-password-view";

// Super Admin / Platform Team password recovery. Inherits the platform
// (superadmin) styling from app/admin-login/layout.tsx.
export default function AdminForgotPasswordPage() {
  return <ForgotPasswordView portal="platform" />;
}
