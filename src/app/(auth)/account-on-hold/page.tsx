import type { Metadata } from "next";
import { PauseCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ACCOUNT_ON_HOLD_CONTACT, ACCOUNT_ON_HOLD_MESSAGE } from "@/lib/account-hold";
import { doorOf } from "@/lib/auth-doors";

export const metadata: Metadata = {
  title: "Account on hold",
  robots: { index: false, follow: false },
};

/**
 * Where a frozen account lands: signing in, an open tab's next request and a Google sign in all end here. Public on purpose
 * (a held session cannot load anything signed-in) and it reveals nothing: no reason, no history, only what to do next.
 */
export default async function AccountOnHoldPage({ searchParams }: { searchParams: Promise<{ as?: string | string[] }> }) {
  const role = doorOf((await searchParams).as, ["intern", "employer"]);
  return (
    <AuthShell title="Your account is on hold." subtitle="Nothing has been deleted. Findtern admin can restore access after you get in touch.">
      <div className="flex items-start gap-3">
        <PauseCircle className="mt-1 size-6 shrink-0 text-brand-700" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Account on hold</h1>
          <p className="mt-2 text-base text-ink-700" data-testid="hold-message">{ACCOUNT_ON_HOLD_MESSAGE}</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted px-4 py-4 text-sm text-ink-700">
        <p className="font-medium text-ink-900">Contact Findtern admin</p>
        <p className="mt-1">
          Write to{" "}
          <a href={`mailto:${ACCOUNT_ON_HOLD_CONTACT}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
            {ACCOUNT_ON_HOLD_CONTACT}
          </a>{" "}
          from the email on your {role === "employer" ? "company " : ""}account. This is also how you appeal.
        </p>
        <p className="mt-3 text-text-subtle">Your profile, documents and any payments or timesheets already in progress are kept safe.</p>
      </div>
    </AuthShell>
  );
}
