import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <AuthShell
      compact
      eyebrow="Operations"
      title="Findtern operations console."
      subtitle="Interns, employers, payments and site content. Restricted to staff accounts with an assigned role."
    >
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Admin sign in</h1>
      <p className="mt-1.5 text-sm text-text-subtle">Staff access only.</p>

      <div className="mt-8">
        <LoginForm endpoint="/api/auth/admin/login" redirectTo="/admin/dashboard" />
      </div>
    </AuthShell>
  );
}