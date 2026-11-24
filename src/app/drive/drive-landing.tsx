import type { Metadata } from "next";
import Link from "next/link";

import { getSession } from "@/lib/auth";
import { driveWindow } from "@/lib/college/access";
import { audienceLabel } from "@/lib/college/labels";
import { eligibleStudents } from "@/lib/college/scope";
import type { schema } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { Surface, DetailRow } from "@/components/app/primitives";
import { Logo } from "@/components/brand/logo";
import {
  CollegeMark,
  DriveStatePill,
  KIND_LABEL,
  driveTime,
  timeLeft,
} from "@/components/employer/drive-parts";
import { DriveEnterButton } from "@/components/employer/drive-enter-button";

/**
 * The landing page for a college drive, reached from the share link (/drive/[token]) or from an emailed invite
 * (/drive/invite/[driveId]). Public, but it shows only what the college would put on a poster: who, what, when, and
 * how many students. No student data until a signed-in employer enters (and is checked again on every call after
 * that). Both URLs carry a secret, so the pages ask browsers not to send it onward in a Referer and search engines
 * not to index it.
 */
export const driveLandingMetadata: Metadata = {
  title: "Campus drive",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export type DriveEntry =
  | { kind: "token"; token: string; here: string }
  | {
      kind: "invite";
      credential: { driveId: string; email: string; sig: string };
      here: string;
      company: string;
      email: string;
      /** An employer account already uses this address: it signs in, it does not register. */
      hasAccount: boolean;
    };

export async function DriveLanding({
  drive,
  college,
  entry,
}: {
  drive: typeof schema.collegeDrives.$inferSelect;
  college: typeof schema.colleges.$inferSelect;
  entry: DriveEntry;
}) {

  const state = driveWindow(drive);
  const session = await getSession();
  const students = state === "revoked" ? null : await eligibleStudents(drive);
  const studentCount = students?.length ?? null;
  const scoredCount = students?.filter((s) => s.score !== null).length ?? 0;
  const left = state === "live" ? timeLeft(drive.endsAt) : null;

  return (
    <div className="min-h-[100dvh] bg-ink-50">
      <header className="border-b border-ink-200/80 bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          {/* Findtern stays where it always is; the college sits opposite it. */}
          <Logo className="h-6 shrink-0" alt="Findtern" priority />
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right leading-tight">
              <p className="text-xs text-text-subtle">In association with</p>
              <p className="truncate text-sm font-semibold text-ink-900">{college.name}</p>
            </div>
            <CollegeMark name={college.name} logoUrl={college.logoUrl} className="size-10 rounded-lg text-xs" />
          </div>
        </div>
      </header>

      <main id="main" className="container-page py-10 sm:py-16">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
          <section aria-labelledby="drive-title" className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DriveStatePill state={state} />
              <span className="text-sm font-medium text-ink-600">{KIND_LABEL[drive.kind] ?? "Campus drive"}</span>
              {audienceLabel(drive.audience) ? <span className="text-sm font-medium text-ink-600">· {audienceLabel(drive.audience)}</span> : null}
            </div>
            <h1
              id="drive-title"
              className="mt-4 text-balance text-3xl font-semibold tracking-[-0.025em] text-ink-900 sm:text-4xl"
            >
              {drive.title}
            </h1>
            <p className="mt-3 text-pretty text-[0.9375rem] leading-relaxed text-ink-600">
              {college.name}
              {college.city ? `, ${college.city}` : ""} is inviting employers to meet its students on Findtern.
              {drive.description ? ` ${drive.description}` : ""}
            </p>

            {/* One quiet list, not four equal cards with an icon each (a §0 tell). */}
            <Surface className="mt-8 px-5">
              <dl className="divide-y divide-ink-100">
                <DetailRow label="Opens" value={driveTime(drive.startsAt)} mono />
                <DetailRow label="Closes" value={`${driveTime(drive.endsAt)}${left ? ` · ${left}` : ""}`} mono />
                {studentCount !== null ? (
                  <DetailRow label="Students in this drive" value={`${studentCount.toLocaleString("en-IN")} eligible`} mono />
                ) : null}
                {studentCount ? (
                  <DetailRow label="AI-interviewed" value={`${scoredCount.toLocaleString("en-IN")} with a Findtern Score`} mono />
                ) : null}
              </dl>
            </Surface>
          </section>

          <Surface className="p-6">
            <EntryPanel state={state} role={session?.role ?? null} entry={entry} collegeName={college.name} />
          </Surface>
        </div>
      </main>
    </div>
  );
}


function EntryPanel({
  state,
  role,
  entry,
  collegeName,
}: {
  state: ReturnType<typeof driveWindow>;
  role: string | null;
  entry: DriveEntry;
  collegeName: string;
}) {
  if (state === "revoked" || state === "ended") {
    return (
      <PanelCopy
        title={state === "ended" ? "This drive has ended" : "The college has closed this link"}
        body="Ask the placement office for a new link if you were expecting to join. You can still find candidates on Findtern."
      >
        <ButtonLink href="/employers" variant="outline" block>
          Hire on Findtern
        </ButtonLink>
      </PanelCopy>
    );
  }
  if (state === "upcoming") {
    return (
      <PanelCopy
        title="This drive hasn't opened yet"
        body="Keep this link. It starts working at the opening time above; nothing to do until then."
      />
    );
  }
  if (role === "employer") {
    return (
      <PanelCopy title="You're signed in" body="Enter to browse the college's eligible students, shortlist and invite them to short calls.">
        <DriveEnterButton credential={entry.kind === "token" ? { token: entry.token } : entry.credential} />
      </PanelCopy>
    );
  }
  if (role) {
    return (
      <PanelCopy
        title="This link is for employers"
        body="Students don't need it: when your college runs a drive, it shows up on your Findtern dashboard."
      >
        <ButtonLink href="/" variant="outline" block>
          Go to Findtern
        </ButtonLink>
      </PanelCopy>
    );
  }
  const next = encodeURIComponent(entry.here);
  const signIn = `/login?as=employer&next=${next}`;
  if (entry.kind === "invite" && entry.hasAccount) {
    // They already have an account: only sign in, no registration to wade through.
    return (
      <PanelCopy title="Sign in to enter" body={`${collegeName} invited ${entry.company}. Sign in with your company's Findtern account and you land straight in the drive.`}>
        <ButtonLink href={signIn} size="lg" block>
          Sign in to enter
        </ButtonLink>
      </PanelCopy>
    );
  }
  if (entry.kind === "invite") {
    // A new company: registration first, with the invite's company and address filled in, then back here.
    const prefill = new URLSearchParams({ as: "employer", next: entry.here, company: entry.company, email: entry.email });
    return (
      <PanelCopy title="Register to enter" body={`${collegeName} invited ${entry.company}. Registering is free and takes about a minute; you come straight back to the drive.`}>
        <div className="flex flex-col gap-2.5">
          <ButtonLink href={`/signup?${prefill.toString()}`} size="lg" block>
            Register your company
          </ButtonLink>
          <Link href={signIn} className="inline-flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            Already on Findtern? Sign in
          </Link>
        </div>
      </PanelCopy>
    );
  }
  return (
    <PanelCopy title="Sign in to enter" body="Use your Findtern employer account. New here? Creating one takes two minutes and is free.">
      <div className="flex flex-col gap-2.5">
        <ButtonLink href={signIn} size="lg" block>
          Sign in to enter
        </ButtonLink>
        <Link
          href={`/signup?as=employer&next=${next}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          Create an employer account
        </Link>
      </div>
    </PanelCopy>
  );
}

function PanelCopy({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
