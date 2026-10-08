import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="For candidates"
      title="One assessment. A published score. A rate you can see before anyone negotiates."
      subtitle="Create an account, verify your email, and finish your profile — employers see the same profile you do."
      footer={
        <p className="text-sm text-text-subtle">
          Hiring for interns instead?{" "}
          <Link href="/employer/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Employer sign in
          </Link>
        </p>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Create your account</h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        We verify your email with a one-time code before anything is created.
      </p>

      <div className="mt-8">
        <SignupForm />
      </div>

      {/* Both doors, so neither audience is a dead end. */}
      <p className="mt-7 text-center text-sm text-text-subtle">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-700 underline-offset-4 hover:underline"
        >
          Sign in
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