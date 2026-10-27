import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import { AdminEmpty, AdminPageHeader, Panel } from "@/components/admin/panel";
import { driveWindow } from "@/lib/college/access";
import { drivesOverview } from "@/lib/college/drives";
import { DRIVE_KIND_LABEL, WINDOW_LABEL } from "@/lib/college/labels";
import { requireCollegeContext } from "@/lib/college/scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function DrivesPage() {
  const ctx = await requireCollegeContext();
  const drives = await drivesOverview(ctx.college.id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Drives"
        subtitle="A drive is a dated link you send to employers. They sign in and see only your eligible students."
        action={
          <Link href="/college/drives/new" className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-[14px] font-semibold text-white hover:bg-brand-600">
            <Plus className="size-4" aria-hidden /> New drive
          </Link>
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
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[12px] font-semibold",
                            w === "live" ? "bg-brand-50 text-brand-800" : w === "upcoming" ? "bg-blue-50 text-blue-800" : "bg-ink-100 text-ink-600",
                          )}
                        >
                          {WINDOW_LABEL[w]}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-text-subtle">
                        {DRIVE_KIND_LABEL[drive.kind] ?? drive.kind} · {fmt(drive.startsAt)} to {fmt(drive.endsAt)}
                      </p>
                    </div>
                    <dl className="nums flex gap-6 text-[13px]">
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
