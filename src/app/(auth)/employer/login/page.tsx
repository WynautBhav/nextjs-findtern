import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { googleLoginEnabled, oauthErrorMessage, safeNext } from "@/lib/google";

export const metadata: Metadata = {
  title: "Employer sign in",
  robots: { index: false, follow: false },
};

export default async function EmployerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const oauthError = oauthErrorMessage(one(params.oauthError));
  // Where sign in returns to (EMH-37): the page that sent them here, e.g. a campus drive link.
  const next = safeNext(one(params.next), "");
  const googleHref = `/api/auth/google/start?role=employer${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  return (
    <AuthShell
      eyebrow="For employers"
      title="Hire someone who has already been screened."
      subtitle="Every candidate arrives interviewed, tested and scored. Filter on Findtern Score, skills and interests, then send a proposal in one sitting."
      footer={
        <p className="text-sm text-text-subtle">
          New to Findtern?{" "}
          <Link href="/employer/signup" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Sign up
          </Link>
          <span className="mx-2 text-ink-300" aria-hidden>
            ·
          </span>
          <Link href="/employers" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            See how hiring works
          </Link>
        </p>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Employer sign in</h1>
      <p className="mt-1.5 text-sm text-text-subtle">Access your hiring dashboard.</p>

      {oauthError ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{oauthError}</span>
        </div>
      ) : null}

      <div className="mt-8">
        <LoginForm
          endpoint="/api/auth/employer/login"
          redirectTo={next || "/employer/dashboard"}
          forgotHref="/employer/forgot-password"
          googleHref={googleLoginEnabled() ? googleHref : undefined}
          googleLabel="Sign in or sign up with Google"
          verifyHref="/employer/verify-email"
        />
      </div>
    </AuthShell>
  );
}