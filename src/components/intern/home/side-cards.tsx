import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { Pill, Surface, type Tone } from "@/components/app/primitives";
import { bandRateLine } from "@/components/intern/home/band-rate";
import { OpenToWorkToggle } from "@/components/intern/open-to-work-toggle";

export function ProfileCard({ status, score, openToWork }: { status: { tone: Tone; label: string }; score: number | null; openToWork: boolean }) {
  return (
    <Surface as="section" aria-labelledby="profile-title" className="p-5 lg:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="profile-title" className="text-base font-semibold text-ink-900">Your profile</h2>
        <Pill tone={status.tone}>{status.label}</Pill>
        <Link href="/intern/profile" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
          See it as employers do
        </Link>
      </div>
      <p className="mt-1 text-sm text-text-subtle">
        {status.tone === "live"
          ? "Employers can find you in search and send you offers."
          : status.tone === "closed"
            ? "Open to work is off, so new employers cannot find you."
            : "Employers find you once you are activated and scored."}
      </p>
      {score !== null ? <p className="mt-3 text-sm text-ink-700">{bandRateLine(score)}</p> : null}
      <div className="mt-3 border-t border-ink-100 pt-3">
        <OpenToWorkToggle initial={openToWork} brief />
      </div>
    </Surface>
  );
}

export function CollegeCard({ college, working }: { college: { name: string; status: string } | null | undefined; working: boolean }) {
  if (college) {
    return (
      <Surface className="flex min-h-14 items-center gap-2 p-5 text-sm text-ink-700 lg:p-6">
        <GraduationCap className="size-4 shrink-0 text-brand-700" aria-hidden />
        <span className="min-w-0">
          <Link href="/intern/settings#college" className="font-medium text-ink-900 hover:text-brand-700">{college.name}</Link>
          {college.status === "verified" ? " · verified" : " · not verified yet"}
        </span>
      </Surface>
    );
  }
  if (working) return null;
  return (
    <Link href="/intern/settings#college" className="block rounded-apple-xl border border-ink-200/80 bg-white p-5 transition-colors hover:bg-ink-50 lg:p-6">
      <span className="block text-base font-semibold text-ink-900">Is your college on Findtern?</span>
      <span className="mt-1 block text-sm text-text-subtle">
        Join it to be seen in your college&apos;s placement drives, where employers call students the same day.
      </span>
    </Link>
  );
}
