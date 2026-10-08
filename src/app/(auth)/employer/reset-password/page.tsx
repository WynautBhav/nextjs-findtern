import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-reset-forms";

export const metadata: Metadata = {
  title: "Choose a new company password",
  robots: { index: false, follow: false },
};

/* Mirrors the intern reset page. The token arrives as `?token=…` and is handed
 * to the client form rather than read here, so a reset link never ends up in
 * cached server-rendered HTML. `role="employer"` tells the form to send the
 * user back to the employer sign-in, and the emailed link lands here rather
 * than on /reset-password. */

export default async function EmployerResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;

  return (
    <AuthShell
      compact
      eyebrow="Company account recovery"
      title="Choose a new password."
      subtitle="The link works once. After it is used, every other session on that account ends."
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Set a new password</h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        Pick something you have not used here before.
      </p>

      <div className="mt-8">
        <ResetPasswordForm token={value ?? null} role="employer" />
      </div>
    </AuthShell>
  );
}