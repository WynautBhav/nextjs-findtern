import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Placement console sign in | Findtern",
  robots: { index: false, follow: false },
};

export default function CollegeLoginPage() {
  return (
    <AuthShell
      compact
      eyebrow="College partners"
      title="Your students, their interviews, your drives."
      subtitle="See who has joined, how they scored in the AI interview, and run virtual placement drives employers join with one link."
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Placement console</h1>
      <p className="mt-1.5 text-sm text-text-subtle">
        For placement officers of partner colleges. Your login comes from Findtern.
      </p>

      <div className="mt-8">
        <LoginForm endpoint="/api/auth/college/login" redirectTo="/college" />
      </div>
      <p className="mt-6 text-sm text-text-subtle">
        Forgot your password, or need a login for a colleague?{" "}
        <a href="/contact" className="font-medium text-brand-700 hover:underline">
          Ask Findtern
        </a>
        : placement console logins are issued and reset by our team.
      </p>
    </AuthShell>
  );
}
