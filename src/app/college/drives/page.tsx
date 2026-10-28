import Link from "next/link";
import { Plus } from "lucide-react";

import { Panel } from "@/components/admin/panel";
import { driveWindow } from "@/lib/college/access";
import { drivesOverview } from "@/lib/college/drives";
import { DRIVE_KIND_LABEL } from "@/lib/college/labels";
import { requireCollegeContext } from "@/lib/college/scope";
import { ButtonLink } from "@/components/ui/button";
import { shortDateTime } from "@/lib/format";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { DriveStatePill } from "@/components/employer/drive-parts";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => shortDateTime(d, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function DrivesPage() {
  const ctx = await requireCollegeContext();
  const drives = await drivesOverview(ctx.college.id);

  return (
    <div className="space-y-6">
      <PageHead
        title="Drives"
        action={
          <ButtonLink href="/college/drives/new">
            <Plus className="size-4" aria-hidden /> New drive
          </ButtonLink>
        }
      />
      <Panel as="div">
        {drives.length === 0 ? (
          <EmptyScene
            title="No drives yet"
            body="A drive is a dated link you send to the companies you invite. They sign in and see only your eligible students, while it is open."
            next={{ href: "/college/drives/new", label: "Set up your first drive" }}
            who="You - set the dates and who is eligible"
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
                        <DriveStatePill state={w} audience="college" />
                      </p>
                      <p className="mt-0.5 text-sm text-text-subtle">
                        {DRIVE_KIND_LABEL[drive.kind] ?? drive.kind} · {fmt(drive.startsAt)} to {fmt(drive.endsAt)}
                      </p>
                    </div>
                    {/* Fixed, right-aligned columns so each figure lines up down the
                        list (they were a loose flex row, left-aligned). On a phone
                        the row takes the card width and labels wrap (QA-157). */}
                    <dl className="nums grid shrink-0 grid-cols-[5.5rem_5.5rem_7rem] gap-x-4 text-right text-sm max-sm:w-full max-sm:grid-cols-3 max-sm:text-left">
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
