import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { googleLoginEnabled, oauthErrorMessage, safeNext } from "@/lib/google";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const oauthError = oauthErrorMessage(one(params.oauthError));
  // Where sign in returns to (INT-07): the page that sent them here.
  const next = safeNext(one(params.next), "");
  const withNext = (path: string) => (next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path);

  return (
    <AuthShell
      eyebrow="For candidates"
      title="Sign in to see your score, your rate, and your offers."
      subtitle="One assessment sets your Findtern Score. That score decides what employers pay you. Both are visible to you before anyone else sees them."
      footer={
        <p className="text-sm text-text-subtle">
          Hiring instead?{" "}
          <Link href="/employer/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Employer sign in
          </Link>
        </p>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-1.5 text-sm text-text-subtle">Sign in to your intern account.</p>

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
          endpoint="/api/auth/login"
          redirectTo={next || "/intern/dashboard"}
          forgotHref="/forgot-password"
          googleHref={googleLoginEnabled() ? withNext("/api/auth/google/start?role=intern") : undefined}
          googleLabel="Sign in or sign up with Google"
          verifyHref="/verify-email"
        />
      </div>

      {/* Reciprocal link, not a dead end. Someone who landed here without an
          account needs one click to the other door - the header now sends both
          audiences to one menu, so these two pages have to carry the routing
          between them themselves. */}
      <p className="mt-7 text-center text-sm text-text-subtle">
        New to Findtern?{" "}
        <Link
          href={withNext("/signup")}
          className="font-semibold text-brand-700 underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
        <span className="mx-2 text-ink-300" aria-hidden>
          ·
        </span>
        <Link
          href="/employer/signup"
          className="font-semibold text-brand-700 underline-offset-4 hover:underline"
        >
          Hire interns
        </Link>
      </p>
    </AuthShell>
  );
}