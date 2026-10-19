import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { oauthErrorMessage } from "@/lib/google";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const oauthError = oauthErrorMessage(one(params.oauthError));
  // Back from Google with a verified address and no account yet. The values
  // only prefill the form; the signup API checks the verification itself.
  const google =
    one(params.google) === "1" && one(params.email)
      ? { email: one(params.email), firstName: one(params.firstName), lastName: one(params.lastName) }
      : null;

  return (
    <AuthShell
      eyebrow="For candidates"
      title="One assessment. A published score. A rate you can see before anyone negotiates."
      subtitle="Create an account, verify your email, and finish your profile - employers see the same profile you do."
      footer={
        <p className="text-sm text-text-subtle">
          Hiring for interns instead?{" "}
          <Link href="/employer/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Employer sign in
          </Link>
        </p>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {google ? "Finish creating your account" : "Create your account"}
      </h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        {google
          ? "Google has confirmed your email. Add your phone number and a password to finish."
          : "We verify your email with a one-time code before anything is created."}
      </p>

      {oauthError ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{oauthError}</span>
        </div>
      ) : null}

      {google ? null : (
        <div className="mt-8 space-y-5">
          <GoogleButton href="/api/auth/google/start?role=intern" label="Sign up with Google" />
          <div className="relative py-1">
            <span className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t border-ink-100" />
            </span>
            <span className="relative mx-auto block w-fit bg-white px-3 text-xs uppercase tracking-[0.12em] text-ink-400">
              or with your email
            </span>
          </div>
        </div>
      )}

      <div className={google ? "mt-8" : "mt-5"}>
        <SignupForm google={google} />
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