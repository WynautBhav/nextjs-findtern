import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return (
    <AuthShell compact eyebrow="Account" title="Verify your email." subtitle="One code, then you can sign in.">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Verify your email</h1>
      <p className="mt-1.5 text-sm text-text-subtle">We&apos;ll email a 6-digit code to the address on your account.</p>
      <div className="mt-8">
        <VerifyEmailForm role="employer" initialEmail={email} loginHref="/employer/login" />
      </div>
    </AuthShell>
  );
}
