import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";

import { EmptyScene, FilterTabs, Surface } from "@/components/app/primitives";
import { CollegeHero, HeroStat, HeroStats, WindowLine } from "@/components/college/kit";
import { DriveStatePill } from "@/components/employer/drive-parts";
import { ButtonLink } from "@/components/ui/button";
import { driveWindow } from "@/lib/college/access";
import { drivesOverview } from "@/lib/college/drives";
import { driveMeetCounts, driveShortlistCount } from "@/lib/college/drive-board-db";
import { driveReach } from "@/lib/college/drive-reach";
import { readinessForMany } from "@/lib/college/student-readiness-db";
import { DriveReachView } from "@/components/college/drive-reach-view";
import { eligibleStudents } from "@/lib/college/scope";
import { DRIVE_KIND_LABEL, audienceLabel } from "@/lib/college/labels";
import { timeUntil } from "@/lib/college/time-left";
import { requireCollegeContext } from "@/lib/college/scope";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LiveRefresh } from "@/components/app/live-refresh";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Request time: where "now" sits on each drive's line. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

function timeNote(state: string, starts: Date, ends: Date, now: number): string {
  // The employer's drive page reads the same window through the same rule (lib/college/time-left.ts): whole units, rounded down.
  if (state === "live") return `${timeUntil(ends.getTime() - now) ?? "Under a minute"} left`;
  if (state === "upcoming") return `Opens in ${timeUntil(starts.getTime() - now) ?? "a moment"}`;
  return state === "revoked" ? "You closed the link" : "Finished";
}

/**
 * Every campus drive as a card: its window drawn as a line with "now" on it, and what happened inside
 * (employers who entered, students shortlisted, calls answered). Live first, then upcoming, then past.
 */
export default async function DrivesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await requireCollegeContext();
  const [all, sp] = await Promise.all([drivesOverview(ctx.college.id), searchParams]);
  const now = requestTime();
  // Each drive's students once: its meets by the drive page's own rules (verified students, calls and interviews), and
  // its strength with why the rest were left out.
  const eligibleOf = new Map(await Promise.all(all.map(async ({ drive }) => [drive.id, await eligibleStudents(drive)] as const)));
  const meets = new Map(
    await Promise.all(
      all.map(async ({ drive }) => {
        const ids = (eligibleOf.get(drive.id) ?? []).filter((s) => s.status === "verified").map((s) => s.userId);
        return [drive.id, await driveMeetCounts(drive, ids, now)] as const;
      }),
    ),
  );
  // Students shortlisted, by the drive page's own rule (the drive's list plus each company's regular Shortlist).
  const shortlistedOf = new Map(
    await Promise.all(
      all.map(async ({ drive }) => {
        const ids = (eligibleOf.get(drive.id) ?? []).filter((s) => s.status === "verified").map((s) => s.userId);
        return [drive.id, await driveShortlistCount(drive.id, ids)] as const;
      }),
    ),
  );
  const readiness = await readinessForMany([...new Set([...eligibleOf.values()].flat().map((s) => s.userId))]);
  const reachOf = (id: string) => driveReach(eligibleOf.get(id) ?? [], readiness);
  // Active = open now or still to open; Past = finished or closed by the officer.
  const allStates = all.map(({ drive }) => driveWindow(drive, now));
  const activeCount = allStates.filter((st) => st === "live" || st === "upcoming").length;
  const view = sp.view === "past" ? "past" : "active";
  const drives = all.filter((_, i) => (view === "active") === (allStates[i] === "live" || allStates[i] === "upcoming"));
  const states = drives.map(({ drive }) => driveWindow(drive, now));
  const live = allStates.filter((s) => s === "live").length;
  const employers = all.reduce((n, d) => n + d.employers, 0);
  const shortlisted = [...shortlistedOf.values()].reduce((n, c) => n + c, 0);
  const answered = all.reduce((n, d) => n + (meets.get(d.drive.id)?.accepted ?? 0), 0);
  return (
    <div className="space-y-6">
      <LiveRefresh everyMs={60_000} />
      <CollegeHero
        title="Campus drives"
        lede="One link per drive. The employers you send it to sign in and see only your verified students, while the drive is open."
        actions={
          <ButtonLink href="/college/drives/new" variant="white">
            <Plus className="size-4" aria-hidden /> Create new drive
          </ButtonLink>
        }
      >
        {all.length > 0 ? (
          <HeroStats cols={4}>
            <HeroStat label="Open now" value={live} hint={live ? "Employers can enter" : "No drive is open"} />
            <HeroStat label="Employers entered" value={employers} hint={`across ${all.length} ${all.length === 1 ? "drive" : "drives"}`} />
            <HeroStat label="Students shortlisted" value={shortlisted} />
            <HeroStat label="Meets accepted" value={answered} hint="Drive calls and interviews" />
          </HeroStats>
        ) : null}
      </CollegeHero>

      {all.length > 0 ? (
        <FilterTabs
          label="Show drives"
          value={view}
          hrefFor={(k) => (k === "past" ? "/college/drives?view=past" : "/college/drives")}
          tabs={[
            { key: "active", label: "Active drives", count: activeCount },
            { key: "past", label: "Past drives", count: all.length - activeCount },
          ]}
        />
      ) : null}

      {all.length > 0 && drives.length === 0 ? (
        <Surface className="p-6 text-sm text-text-subtle">
          {view === "active" ? "No drive is open or coming up. Create one to send employers a new link." : "No past drives yet. A drive moves here once it ends or you turn it off."}
        </Surface>
      ) : drives.length === 0 ? (
        <Surface>
          <EmptyScene
            title="No drives yet"
            body="A drive is a dated link you send to the companies you invite. They sign in and see only your eligible students, while it is open."
            next={{ href: "/college/drives/new", label: "Set up your first drive" }}
            who="You - set the dates and who is eligible"
          />
        </Surface>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {drives.map(({ drive, employers: e }, i) => {
            const s = shortlistedOf.get(drive.id) ?? 0;
            const { sent: calls, accepted } = meets.get(drive.id) ?? { sent: 0, accepted: 0 };
            const w = states[i];
            const span = drive.endsAt.getTime() - drive.startsAt.getTime();
            const share = w === "live" && span > 0 ? Math.min(1, Math.max(0, (now - drive.startsAt.getTime()) / span)) : null;
            return (
              <li key={drive.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                <Link
                  href={`/college/drives/${drive.id}`}
                  className={cn(
                    "tile-lift group flex h-full flex-col rounded-apple-xl border bg-white p-5 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:p-6",
                    w === "live" ? "border-brand-300 shadow-[0_0_0_4px_var(--color-brand-50)]" : "border-ink-200/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <DriveStatePill state={w} audience="college" />
                        <span className="text-xs font-medium text-text-subtle">{DRIVE_KIND_LABEL[drive.kind] ?? drive.kind}</span>
                        {audienceLabel(drive.audience) ? <span className="text-xs font-medium text-text-subtle">· {audienceLabel(drive.audience)}</span> : null}
                      </p>
                      <h2 className="mt-2.5 line-clamp-2 break-words text-xl font-semibold tracking-[-0.02em] text-ink-900">{drive.title}</h2>
                    </div>
                    <ArrowUpRight className="size-5 shrink-0 text-ink-400 transition-colors group-hover:text-brand-700" aria-hidden />
                  </div>
                  <div className="mt-5">
                    <WindowLine share={share} state={w} />
                    <p className="nums mt-2 flex flex-wrap justify-between gap-x-4 text-xs text-text-subtle">
                      <span>{fmt(drive.startsAt)}</span>
                      <span className={cn("font-medium", w === "live" ? "text-brand-700" : "text-ink-700")}>{timeNote(w, drive.startsAt, drive.endsAt, now)}</span>
                      <span>{fmt(drive.endsAt)}</span>
                    </p>
                  </div>
                  <dl className="nums mt-5 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4">
                    {[
                      ["Employers", String(e)],
                      ["Shortlisted", String(s)],
                      ["Meets accepted", calls ? `${accepted} of ${calls}` : "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-text-subtle">{label}</dt>
                        <dd className="mt-0.5 text-2xl font-semibold tracking-[-0.02em] text-ink-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <DriveReachView reach={reachOf(drive.id)} compact className="mt-4 border-t border-ink-100 pt-4" note={w === "live" || w === "upcoming" ? undefined : "Reasons as they stand today."} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
