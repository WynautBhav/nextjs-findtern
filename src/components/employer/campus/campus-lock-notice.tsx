import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Above the candidate list while the company is inside a campus drive: whose students these are, the Interns /
 * Full-time switch (Full-time = final-year students, offered at the drive's 1% fee from their profile), and the way to
 * the drive overview. The list below is the regular one, with the regular hiring flow.
 */
export function CampusLockNotice({
  driveId,
  collegeName,
  fullTime,
  internsHref,
  fullTimeHref,
}: {
  driveId: string;
  collegeName: string;
  fullTime: boolean;
  internsHref: string;
  fullTimeHref: string;
}) {
  const pill = (on: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
      on ? "bg-brand-950 font-semibold text-white" : "font-medium text-brand-900 hover:bg-brand-100",
    );
  return (
    <div role="note" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-950">
      <p className="flex min-w-0 flex-1 basis-72 items-start gap-2.5">
        <GraduationCap aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <span className="min-w-0">
          <span className="font-semibold">{collegeName}&apos;s campus drive.</span> You see its students only, with the drive&apos;s pricing and Findtern Pro on.{" "}
          <Link href={`/employer/drives/${driveId}`} className="font-medium underline underline-offset-2">
            Drive overview
          </Link>
        </span>
      </p>
      <nav aria-label="Hiring for" className="flex shrink-0 gap-1 rounded-full border border-brand-200 bg-white p-1">
        <Link href={internsHref} aria-current={fullTime ? undefined : "page"} className={pill(!fullTime)}>
          Interns
        </Link>
        <Link href={fullTimeHref} aria-current={fullTime ? "page" : undefined} className={pill(fullTime)}>
          Full-time · final year
        </Link>
      </nav>
    </div>
  );
}
