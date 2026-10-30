import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";
import { doorOf } from "@/lib/auth-doors";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ as?: string | string[] }> }) {
  const role = doorOf((await searchParams).as, ["intern", "employer"]);
  return (
    <AuthShell
      title="Reset your password."
      subtitle="We email a single-use link that expires in 30 minutes."
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Forgot password</h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        Enter the {role === "employer" ? "company " : ""}email on your account and we will send a reset link.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm role={role} />
      </div>
    </AuthShell>
  );
}
