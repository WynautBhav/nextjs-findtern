import { NextResponse } from "next/server";

import { getSession, unauthenticatedResponse } from "@/lib/auth";
import { activeCampusDrives } from "@/lib/college/campus-lock";
import { driveCountdown } from "@/lib/college/drive-pricing";
import { DRIVE_DISCOUNT_PERCENT, DRIVE_PPO_FEE_PERCENT, STANDARD_PPO_FEE_PERCENT } from "@/lib/college/drive-pricing";

/**
 * Is this company campus-locked right now, in which drives, and how long is left. Read live against server time on every
 * call (a drive that ended a minute ago reads ended, no cron needed). The banner and the Drives tab read the same rule.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return unauthenticatedResponse();
  if (session.role !== "employer") return NextResponse.json({ error: "Employers only" }, { status: 403 });
  const now = new Date();
  const drives = await activeCampusDrives(session.uid);
  return NextResponse.json(
    {
      locked: drives.length > 0,
      benefits: { discountPercent: DRIVE_DISCOUNT_PERCENT, ppoFeePercent: DRIVE_PPO_FEE_PERCENT, standardPpoFeePercent: STANDARD_PPO_FEE_PERCENT },
      drives: drives.map((d) => {
        const c = driveCountdown(d.drive.endsAt, now);
        return {
          driveId: d.drive.id,
          title: d.drive.title,
          collegeName: d.collegeName,
          endsAt: d.drive.endsAt.toISOString(),
          daysRemaining: c.daysRemaining,
          showExpiryWarning: c.showExpiryWarning,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
