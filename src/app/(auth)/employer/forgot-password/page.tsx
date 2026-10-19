import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";

export const metadata: Metadata = {
  title: "Reset your company password",
  robots: { index: false, follow: false },
};

export default function EmployerForgotPasswordPage() {
  return (
    <AuthShell
      compact
      eyebrow="Company account recovery"
      title="Reset your password."
      subtitle="We email a single-use link that expires in 30 minutes."
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Forgot password</h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        Enter the company email on your account and we will send a reset link.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm role="employer" />
      </div>
    </AuthShell>
  );
}