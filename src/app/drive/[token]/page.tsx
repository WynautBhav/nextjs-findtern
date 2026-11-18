import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { getSession } from "@/lib/auth";
import { driveWindow } from "@/lib/college/access";
import { eligibleStudents } from "@/lib/college/scope";
import { hashDriveToken } from "@/lib/college/tokens";
import { getDb, schema } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { DetailRow } from "@/components/app/primitives";
import { APP_FONT_CLASSES } from "@/components/layout/app-fonts";
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
 * The link a college sends to employers. Public, but it shows only what the
 * college would put on a poster: who, what, when, and how many students. No
 * student data until a signed-in employer enters (and is checked again on
 * every call after that). The token is a secret, so the page asks browsers
 * not to send it onward in a Referer and search engines not to index it.
 */
export const metadata: Metadata = {
  title: "Campus drive",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function DriveLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 20 || token.length > 100) notFound();

  // A database hiccup says so instead of a 500 page (the link is shared
  // with outside companies, often opened once).
  let row: { drive: typeof schema.collegeDrives.$inferSelect; college: typeof schema.colleges.$inferSelect } | undefined;
  try {
    [row] = await getDb()
      .select({ drive: schema.collegeDrives, college: schema.colleges })
      .from(schema.collegeDrives)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where(eq(schema.collegeDrives.tokenHash, hashDriveToken(token)))
      .limit(1);
  } catch (err) {
    console.error("[drive landing]", err);
    return (
      <div data-app="1" className={`${APP_FONT_CLASSES} min-h-[100dvh] bg-canvas`}>
        <main id="main" className="mx-auto max-w-xl px-4 py-24">
          <h1 className="text-balance text-2xl font-semibold text-ink-900">We couldn&apos;t open this drive just now</h1>
          <p className="mt-3 text-base text-ink-700">Nothing is wrong with your link. Try again in a moment.</p>
        </main>
      </div>
    );
  }
  if (!row || !row.college.isActive) notFound();
  const { drive, college } = row;

  const state = driveWindow(drive);
  const session = await getSession();
  const students = state === "revoked" ? null : await eligibleStudents(drive);
  const studentCount = students?.length ?? null;
  const scoredCount = students?.filter((s) => s.score !== null).length ?? 0;
  const left = state === "live" ? timeLeft(drive.endsAt) : null;
  const here = `/drive/${token}`;

  return (
    <div data-app="1" className={`${APP_FONT_CLASSES} min-h-[100dvh] bg-canvas`}>
      <header className="border-b border-ink-200">
        <div className="container-page flex h-14 items-center justify-between gap-4 sm:h-16">
          <div className="flex min-w-0 items-center gap-3">
            <CollegeMark name={college.name} logoUrl={college.logoUrl} className="size-9 rounded-md text-xs" />
            <span className="truncate text-sm font-semibold text-ink-900">{college.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-ink-600">
            <span className="hidden sm:inline">Placement drive on</span>
            <Logo variant="green" className="h-5" alt="Findtern" priority />
          </div>
        </div>
      </header>

      <main id="main" className="container-page pb-28 pt-8 sm:py-14">
        {/* One column on a phone: what it is, then the way in, then the facts.
            From lg the way in sits beside the title and stays in view. */}
        <div className="mx-auto grid max-w-5xl gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="drive-title" className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <DriveStatePill state={state} />
              <span className="text-sm font-medium text-ink-700">{KIND_LABEL[drive.kind] ?? "Campus drive"}</span>
            </div>
            <h1 id="drive-title" className="mt-4 text-balance text-2xl font-semibold leading-tight text-ink-900 sm:text-4xl">
              {drive.title}
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-base text-ink-700">
              {college.name}
              {college.city ? `, ${college.city}` : ""} is inviting employers to meet its students on Findtern.
              {drive.description ? ` ${drive.description}` : ""}
            </p>
          </section>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <div className="rounded-lg border border-ink-200 bg-surface-raised p-5 sm:p-6">
              <EntryPanel state={state} role={session?.role ?? null} token={token} here={here} />
            </div>
          </div>

          <section aria-label="Drive details" className="min-w-0 lg:col-start-1 lg:row-start-2">
            <dl className="divide-y divide-ink-200 border-y border-ink-200">
              <DetailRow label={state === "live" || state === "ended" ? "Opened" : "Opens"} value={driveTime(drive.startsAt)} mono />
              <DetailRow label="Closes" value={`${driveTime(drive.endsAt)}${left ? ` · ${left}` : ""}`} mono />
              {studentCount !== null ? (
                <DetailRow label="Eligible students" value={studentCount.toLocaleString("en-IN")} mono />
              ) : null}
              {studentCount ? (
                <DetailRow label="With a Findtern Score" value={`${scoredCount.toLocaleString("en-IN")} of ${studentCount.toLocaleString("en-IN")}`} mono />
              ) : null}
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}


function EntryPanel({
  state,
  role,
  token,
  here,
}: {
  state: ReturnType<typeof driveWindow>;
  role: string | null;
  token: string;
  here: string;
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
        <DriveEnterButton token={token} />
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
  const next = encodeURIComponent(here);
  return (
    <PanelCopy title="Sign in to enter" body="Use your Findtern employer account. New here? Creating one takes two minutes and is free.">
      <div className="flex flex-col gap-2.5">
        <ButtonLink href={`/login?as=employer&next=${next}`} size="lg" block>
          Sign in to enter
        </ButtonLink>
        <Link
          href={`/signup?as=employer&next=${next}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md text-sm font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700"
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
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{body}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
