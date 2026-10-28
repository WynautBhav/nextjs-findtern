import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import { AdminEmpty, AdminPageHeader, Panel } from "@/components/admin/panel";
import { driveWindow } from "@/lib/college/access";
import { drivesOverview } from "@/lib/college/drives";
import { DRIVE_KIND_LABEL, WINDOW_LABEL } from "@/lib/college/labels";
import { requireCollegeContext } from "@/lib/college/scope";
import { Pill } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { shortDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function DrivesPage() {
  const ctx = await requireCollegeContext();
  const drives = await drivesOverview(ctx.college.id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Drives"
        subtitle="A drive is a dated link you send to employers. They sign in and see only your eligible students."
        action={
          <ButtonLink href="/college/drives/new">
            <Plus className="size-4" aria-hidden /> New drive
          </ButtonLink>
        }
      />
      <Panel as="div">
        {drives.length === 0 ? (
          <AdminEmpty
            icon={Megaphone}
            title="No drives yet"
            body="Set the dates and who's eligible, then share the link with the companies you invite."
            action={{ href: "/college/drives/new", label: "Set up your first drive" }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {drives.map(({ drive, employers, calls, accepted, shortlisted }) => {
              const w = driveWindow(drive);
              return (
                <li key={drive.id}>
                  <Link href={`/college/drives/${drive.id}`} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-ink-50/60">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900">{drive.title}</span>
                        <Pill tone={w === "live" ? "live" : w === "upcoming" ? "new" : "closed"}>{WINDOW_LABEL[w]}</Pill>
                      </p>
                      <p className="mt-0.5 text-sm text-text-subtle">
                        {DRIVE_KIND_LABEL[drive.kind] ?? drive.kind} · {fmt(drive.startsAt)} to {fmt(drive.endsAt)}
                      </p>
                    </div>
                    <dl className="nums flex gap-6 text-sm">
                      <div><dt className="text-text-subtle">Employers</dt><dd className="font-semibold text-ink-900">{employers}</dd></div>
                      <div><dt className="text-text-subtle">Shortlisted</dt><dd className="font-semibold text-ink-900">{shortlisted}</dd></div>
                      <div><dt className="text-text-subtle">Calls answered</dt><dd className="font-semibold text-ink-900">{calls ? `${accepted} of ${calls}` : "—"}</dd></div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
