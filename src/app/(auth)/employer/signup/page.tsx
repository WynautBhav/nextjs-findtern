import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { EmployerSignupForm } from "@/components/employer/employer-signup-form";

export const metadata: Metadata = {
  title: "Employer sign up | Findtern",
  robots: { index: false, follow: false },
};

export default function EmployerSignupPage() {
  return (
    <AuthShell
      eyebrow="For employers"
      title="Register the company, not a person."
      subtitle="One company account, one billing identity. Add colleagues from the account page once the employer API lands."
      footer={
        <p className="text-sm text-text-subtle">
          Already registered?{" "}
          <Link href="/employer/login" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Employer sign up</h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        Takes about a minute. A company email address is required.
      </p>

      <div className="mt-8">
        <EmployerSignupForm />
      </div>
    </AuthShell>
  );
}
