import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { activeCampusDrives } from "@/lib/college/campus-lock";

export const dynamic = "force-dynamic";

/**
 * There is no list of drives for a company (owner, 23 Nov): while it is inside a live drive this address opens that
 * drive, and once the drive is over (ended, closed by the college, or left) the drive section is gone, also by URL.
 * Offers and hires made in the drive stay on the regular Proposals and Orders pages, badged with the college.
 */
export default async function EmployerDrivesPage() {
  const session = await requireRole("employer");
  const [live] = await activeCampusDrives(session.uid);
  if (!live) notFound();
  redirect(`/employer/drives/${live.drive.id}`);
}
