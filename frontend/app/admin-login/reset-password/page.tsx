import { ResetPasswordView } from "@/components/auth/reset-password-view";

// Target of the platform reset email (see AuthService.forgotPassword).
export default function AdminResetPasswordPage() {
  return <ResetPasswordView portal="platform" />;
}
