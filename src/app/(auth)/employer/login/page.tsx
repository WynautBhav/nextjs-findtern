import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Employer sign in | Findtern",
  robots: { index: false, follow: false },
};

export default function EmployerLoginPage() {
  return (
    <AuthShell
      eyebrow="For employers"
      title="Hire someone who has already been screened."
      subtitle="Every candidate arrives interviewed, tested and scored. Filter on Findtern Score, skills and interests, then send a proposal in one sitting."
      footer={
        <p className="text-sm text-text-subtle">
          New to Findtern?{" "}
          <Link href="/employers" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            See how hiring works
          </Link>
        </p>
      }
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Employer sign in</h1>
      <p className="mt-1.5 text-sm text-text-subtle">Access your hiring dashboard.</p>

      <div className="mt-8">
        <LoginForm
          endpoint="/api/auth/employer/login"
          redirectTo="/employer/dashboard"
          forgotHref="/employer/forgot-password"
          googleHref="/api/auth/google/start?role=employer"
        />
      </div>
    </AuthShell>
  );
}