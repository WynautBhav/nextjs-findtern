import Link from "next/link";
import { Plus } from "lucide-react";

import { driveWindow } from "@/lib/college/access";
import { drivesOverview } from "@/lib/college/drives";
import { DRIVE_KIND_LABEL } from "@/lib/college/labels";
import { requireCollegeContext } from "@/lib/college/scope";
import { ButtonLink } from "@/components/ui/button";
import { shortDateTime } from "@/lib/format";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { DataTable } from "@/components/app/data-table";
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
        lede={drives.length ? `${drives.length} drive${drives.length === 1 ? "" : "s"}, newest first.` : undefined}
        action={
          <ButtonLink href="/college/drives/new">
            <Plus className="size-4" aria-hidden /> New drive
          </ButtonLink>
        }
      />
      <DataTable
        caption="Drives"
        rows={drives}
        rowKey={({ drive }) => drive.id}
        empty={
          <EmptyScene
            title="No drives yet"
            body="A drive is a dated link you send to the companies you invite. They sign in and see only your eligible students, while it is open."
            next={{ href: "/college/drives/new", label: "Set up your first drive" }}
            who="You - set the dates and who is eligible"
          />
        }
        columns={[
          {
            key: "drive",
            header: "Drive",
            primary: true,
            cell: ({ drive }) => (
              <>
                <Link href={`/college/drives/${drive.id}`} className="font-semibold text-ink-900 hover:text-brand-700 touch:inline-flex touch:min-h-11 touch:items-center">
                  {drive.title}
                </Link>
                <span className="block text-xs font-normal text-ink-600">
                  {DRIVE_KIND_LABEL[drive.kind] ?? drive.kind} · {fmt(drive.startsAt)} to {fmt(drive.endsAt)}
                </span>
              </>
            ),
          },
          { key: "state", header: "Status", cell: ({ drive }) => <DriveStatePill state={driveWindow(drive)} audience="college" /> },
          { key: "emp", header: "Employers", align: "right", cell: ({ employers }) => employers || "—" },
          { key: "short", header: "Shortlisted", align: "right", cell: ({ shortlisted }) => shortlisted || "—" },
          { key: "calls", header: "Calls answered", align: "right", cell: ({ calls, accepted }) => (calls ? `${accepted} of ${calls}` : "—") },
        ]}
      />
    </div>
  );
}
