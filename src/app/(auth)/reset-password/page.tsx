import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-reset-forms";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/* The token arrives as `?token=…`. It is passed to the client form rather than
 * read here so the value is never baked into the server-rendered HTML — a reset
 * link should not end up in a cached page. */

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;

  return (
    <AuthShell
      compact
      eyebrow="Account recovery"
      title="Choose a new password."
      subtitle="The link works once. After it is used, every other session on that account ends."
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Set a new password</h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        Pick something you have not used here before.
      </p>

      <div className="mt-8">
        <ResetPasswordForm token={value ?? null} />
      </div>
    </AuthShell>
  );
}