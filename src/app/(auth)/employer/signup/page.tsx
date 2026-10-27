import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/login-form";
import { EmployerSignupForm } from "@/components/employer/employer-signup-form";
import { oauthErrorMessage, safeNext } from "@/lib/google";

export const metadata: Metadata = {
  title: "Employer sign up | Findtern",
  robots: { index: false, follow: false },
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EmployerSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const oauthError = oauthErrorMessage(one(params.oauthError));
  const next = safeNext(one(params.next), "");
  // Back from Google with a verified company address and no account yet. The
  // values only prefill the form; the signup API checks the verification.
  const google =
    one(params.google) === "1" && one(params.email)
      ? { email: one(params.email), name: one(params.name) }
      : null;

  return (
    <AuthShell
      eyebrow="For employers"
      title="Register the company, not a person."
      subtitle="One company account, one billing identity for all your hiring."
      footer={
        <p className="text-sm text-text-subtle">
          Already registered?{" "}
          <Link href="/employer/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
        {google ? "Finish your employer account" : "Employer sign up"}
      </h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        {google
          ? "Google has confirmed your company email. Add the rest to finish."
          : "Takes about a minute. A company email address is required."}
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
          <GoogleButton
            href={`/api/auth/google/start?role=employer${next ? `&next=${encodeURIComponent(next)}` : ""}`}
            label="Sign up with Google"
          />
          <div className="relative py-1">
            <span className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t border-ink-100" />
            </span>
            <span className="relative mx-auto block w-fit bg-white px-3 text-xs uppercase tracking-[0.12em] text-ink-600">
              or with your email
            </span>
          </div>
        </div>
      )}

      <div className={google ? "mt-8" : "mt-5"}>
        <EmployerSignupForm google={google} />
      </div>
    </AuthShell>
  );
}
