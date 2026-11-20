import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MeetPageView, type MeetView } from "@/components/meetings/meet-page-view";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatIst, formatSlotTime } from "@/lib/format";
import { DISCLAIMER_VERSION, openGateStamp } from "@/lib/meetings/gate";
import { hasAccepted, loadGateMeeting } from "@/lib/meetings/gate-service";
import { bookedStart } from "@/lib/meetings/slots";
import { interviewZone, loadProjectZones } from "@/lib/project-zones";

export const metadata: Metadata = { title: "Your meeting | Findtern", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Findtern's own meeting page, what emails and calendar files point at. A booked, live meeting shows the recorded pre-join gate
 * (10 s countdown, then "I understand and agree"); a person who already agreed to the current disclaimer version sees Join
 * straight away. The Meet URL is only ever behind /api/meet/<token>/join, after an acceptance.
 */
export default async function MeetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const [{ token }, { e }] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session || (session.role !== "employer" && session.role !== "intern")) redirect("/login");
  const backHref = session.role === "employer" ? "/employer/dashboard" : "/intern/dashboard";
  const db = getDb();
  const m = await loadGateMeeting(db, token, { role: session.role, uid: session.uid });
  // Unknown token and someone else's meeting read the same, so tokens cannot be probed.
  if (!m) return <MeetPageView kind="invalid" backHref={backHref} />;
  const { iv, state } = m;
  const start = bookedStart(iv);
  const zone = session.role === "intern" ? "Asia/Kolkata" : interviewZone(iv, await loadProjectZones(db, [iv.projectId]));
  const when = start === null ? null : session.role === "intern" ? formatIst(new Date(start), { year: true }) : formatSlotTime(new Date(start), zone);
  let view: MeetView;
  if (state !== "ready") view = { kind: state, when, backHref };
  else if (await hasAccepted(db, iv.id, { role: session.role, uid: session.uid })) view = { kind: "accepted", token, when, backHref };
  else view = { kind: "gate", token, when, backHref, stamp: openGateStamp({ token, role: session.role, uid: session.uid, version: DISCLAIMER_VERSION }) };
  const note = e === "closed" && state === "closed" ? "This meeting can no longer be joined." : null;
  return <MeetPageView {...view} note={note} />;
}
