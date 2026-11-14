import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";

import { PageHead, Surface } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { LOCK_TEXT, lockEnabled, lockedPageName } from "@/lib/intern-lock";
import { internProfileComplete } from "@/lib/intern-precomplete";
import { internUnlockState } from "@/lib/intern-unlock";

export const metadata: Metadata = {
  title: "Unlocks after payment",
  robots: { index: false, follow: false },
};

/**
 * Where a locked page sends an intern who has not paid yet (lib/intern-lock.ts).
 * Calm and short: what is locked, what opens it, one button. Someone who has
 * since paid (or is grandfathered) and lands here from an old link goes Home.
 */
export default async function InternLocked({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const session = await requireRole("intern");
  const from = (await searchParams).from;
  const name = lockedPageName(Array.isArray(from) ? from[0] : from);

  if (!lockEnabled() || (await internUnlockState(session.uid)) === "unlocked") redirect("/intern/dashboard");

  // Before the profile is complete only Home, Complete profile, Settings and Notifications are open (an unreadable check reads as complete).
  const precomplete = (await internProfileComplete(session.uid)) === false;

  return (
    <div>
      <PageHead
        title={name ? `${name} ${LOCK_TEXT.charAt(0).toLowerCase()}${LOCK_TEXT.slice(1)}` : LOCK_TEXT}
        lede={
          precomplete
            ? "Home, Complete profile, Settings and Notifications are open now. Documents and Your profile open once your profile is complete, and the rest once it is activated."
            : "Home, Documents and Your profile are open now. The rest opens once your profile is activated."
        }
      />
      <Surface className="max-w-2xl p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
            <Lock className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">Activate your profile to continue</h2>
            <p className="mt-1 text-pretty text-sm text-ink-600">
              Activation is the one payment on Findtern. Finish your profile first, then activate: employers can find you after your AI interview. If your college gave you a code, you can use it there instead of paying.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href="/intern/dashboard#activation" className="max-sm:w-full">
                Activate your profile
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/intern/dashboard" variant="ghost" className="max-sm:w-full">
                Back to Home
              </ButtonLink>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}
