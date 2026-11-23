"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";

/**
 * The drive's last three days (lib/college/drive-pricing.ts driveCountdown): a quiet strip under the top bar saying the
 * drive is ending and that nothing is lost when it does. Dismissed per drive for the browser session.
 */
export function DriveEndingBanner({ driveId, collegeName, daysRemaining }: { driveId: string; collegeName: string; daysRemaining: number }) {
  const key = `findtern:drive-ending:${driveId}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(key) === "1";
    } catch {
      // Storage blocked: show it.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(dismissed);
  }, [key]);
  if (hidden) return null;
  const left = daysRemaining <= 1 ? "ends within a day" : `ends in ${daysRemaining} days`;
  return (
    <div role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950">
      <div className="flex items-start gap-3 px-4 py-2.5 text-sm sm:items-center">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{collegeName}&apos;s campus drive {left}.</span>{" "}
          Your account then opens to all of Findtern. Your drive shortlists, offers and hires stay, with their drive pricing.{" "}
          <Link href={`/employer/drives/${driveId}`} className="font-medium underline underline-offset-2">
            Open the drive
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(key, "1");
            } catch {
              // Storage blocked: hide for this page only.
            }
            setHidden(true);
          }}
          aria-label="Dismiss"
          className="-my-1 grid size-9 shrink-0 place-items-center rounded-md hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-700"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
