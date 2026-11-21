import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";

import { EmptyScene, Surface } from "@/components/app/primitives";
import { CollegeHero, HeroStat, HeroStats, WindowLine } from "@/components/college/kit";
import { DriveStatePill } from "@/components/employer/drive-parts";
import { ButtonLink } from "@/components/ui/button";
import { driveWindow } from "@/lib/college/access";
import { drivesOverview } from "@/lib/college/drives";
import { DRIVE_KIND_LABEL } from "@/lib/college/labels";
import { requireCollegeContext } from "@/lib/college/scope";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Request time: where "now" sits on each drive's line. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

function timeNote(state: string, starts: Date, ends: Date, now: number): string {
  const hours = (ms: number) => {
    const h = Math.max(1, Math.round(ms / 3600_000));
    return h >= 48 ? `${Math.round(h / 24)} days` : `${h} ${h === 1 ? "hour" : "hours"}`;
  };
  if (state === "live") return `${hours(ends.getTime() - now)} left`;
  if (state === "upcoming") return `Opens in ${hours(starts.getTime() - now)}`;
  return state === "revoked" ? "You closed the link" : "Finished";
}

/**
 * Every campus drive as a card: its window drawn as a line with "now" on it, and what happened inside
 * (employers who entered, students shortlisted, calls answered). Live first, then upcoming, then past.
 */
export default async function DrivesPage() {
  const ctx = await requireCollegeContext();
  const drives = await drivesOverview(ctx.college.id);
  const now = requestTime();
  const states = drives.map(({ drive }) => driveWindow(drive, now));
  const live = states.filter((s) => s === "live").length;
  const employers = drives.reduce((n, d) => n + d.employers, 0);
  const shortlisted = drives.reduce((n, d) => n + d.shortlisted, 0);
  const answered = drives.reduce((n, d) => n + d.accepted, 0);
  return (
    <div className="space-y-6">
      <CollegeHero
        title="Campus drives"
        lede="One link per drive. The employers you send it to sign in and see only your verified students, while the drive is open."
        actions={
          <ButtonLink href="/college/drives/new" variant="white">
            <Plus className="size-4" aria-hidden /> New drive
          </ButtonLink>
        }
      >
        {drives.length > 0 ? (
          <HeroStats cols={4}>
            <HeroStat label="Open now" value={live} hint={live ? "Employers can enter" : "No drive is open"} />
            <HeroStat label="Employers entered" value={employers} hint={`across ${drives.length} ${drives.length === 1 ? "drive" : "drives"}`} />
            <HeroStat label="Students shortlisted" value={shortlisted} />
            <HeroStat label="Calls answered" value={answered} />
          </HeroStats>
        ) : null}
      </CollegeHero>

      {drives.length === 0 ? (
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
          {drives.map(({ drive, employers: e, calls, accepted, shortlisted: s }, i) => {
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
                      ["Calls answered", calls ? `${accepted} of ${calls}` : "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-text-subtle">{label}</dt>
                        <dd className="mt-0.5 text-2xl font-semibold tracking-[-0.02em] text-ink-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
