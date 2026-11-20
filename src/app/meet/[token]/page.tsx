import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { buttonClass } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { formatIst, formatSlotTime } from "@/lib/format";
import { bookedStart } from "@/lib/meetings/slots";
import { interviewZone, loadProjectZones } from "@/lib/project-zones";

export const metadata: Metadata = { title: "Your meeting | Findtern", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Findtern's own meeting page: what emails and calendar files point at. The Meet URL is only ever behind its Join button's redirect. */
export default async function MeetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const [{ token }, { e }] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session || (session.role !== "employer" && session.role !== "intern")) redirect("/login");
  const db = getDb();
  const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.gateToken, token)).limit(1);
  if (!iv || (session.role === "employer" ? iv.employerId : iv.internId) !== session.uid) notFound();
  const start = bookedStart(iv);
  const zone = session.role === "intern" ? "Asia/Kolkata" : interviewZone(iv, await loadProjectZones(db, [iv.projectId]));
  const when = start === null ? null : session.role === "intern" ? `${formatIst(new Date(start), { year: true })}` : formatSlotTime(new Date(start), zone);
  const booked = iv.status === "scheduled" && start !== null;
  const note = e === "pending" ? "The meeting link is not ready yet. Findtern will email you as soon as it is." : e === "closed" ? "This meeting can no longer be joined." : null;
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-2xl font-semibold text-ink-900">{booked ? "Your Findtern meeting" : "This meeting is not booked"}</h1>
      {when ? <p className="mt-2 text-base text-ink-700">{when}</p> : null}
      {note ? <p role="status" className="mt-3 text-sm text-ink-600">{note}</p> : null}
      {booked ? (
        <a href={`/api/meet/${encodeURIComponent(token)}/join`} className={buttonClass({ variant: "primary", size: "md", className: "mt-6 min-h-11" })}>
          Join meeting
        </a>
      ) : (
        <p className="mt-3 text-sm text-ink-600">It was cancelled, has not been confirmed, or is over. Open your dashboard for the current state.</p>
      )}
    </main>
  );
}
