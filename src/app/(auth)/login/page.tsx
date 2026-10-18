import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in | Findtern",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
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

      <div className="mt-8">
        <LoginForm
          endpoint="/api/auth/login"
          redirectTo="/intern/dashboard"
          forgotHref="/forgot-password"
          googleHref="/api/auth/google/start?role=intern"
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
          href="/signup"
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