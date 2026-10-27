import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";

import { AppShell } from "@/components/app/shell";
import { ViewAsBanner } from "@/components/admin/view-as-banner";
import { CollegeLive } from "@/components/intern/college-live";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { membershipOf } from "@/lib/college/membership";
import { loadInternData } from "@/lib/intern-data";
import { nextAction } from "@/lib/journey";

export const metadata = { title: "Findtern" };

/**
 * The intern shell.
 *
 * The stage and the attention list are derived here, once, from the rows the
 * candidate already owns, and handed down as props. A screen therefore cannot
 * show a navigation item that does not apply to this person, and the attention
 * dot cannot disagree with the status strip, because both come from the same
 * Thread.
 *
 * Everything below this is a child, so the sidebar and the tab bar are decided
 * by the database rather than by a route segment. That is the whole mechanism
 * behind "the app changes shape when the job starts".
 */
export default async function InternLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "intern") redirect("/login");

  const data = await loadInternData(session.uid);
  const action = nextAction(data.thread);
  const attentionHrefs = action ? [action.href ?? "/intern/dashboard"] : [];

  const name = await fullName(session.uid);

  const db = getDb();
  const [doc] = await db
    .select({ profilePhotoName: schema.internDocuments.profilePhotoName })
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, session.uid))
    .limit(1);

  // Uploaded photos only; a saved outside URL is never rendered.
  const photoUrl = doc?.profilePhotoName ? "/api/intern/avatar" : null;

  const [unread] = await db
    .select({ value: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientType, "intern"),
        eq(schema.notifications.recipientId, session.uid),
        eq(schema.notifications.isRead, false),
      ),
    );
  const unreadAlerts = Number(unread?.value ?? 0);

  // Only college members heartbeat; "View as" must not mark the student online.
  const college = session.impersonator ? null : await membershipOf(session.uid).catch(() => null);

  return (
    <AppShell
      stage={data.stage}
      attentionHrefs={attentionHrefs}
      name={name}
      email={session.email}
      photoUrl={photoUrl}
      unreadAlerts={unreadAlerts}
    >
      {college ? (
        <CollegeLive
          collegeName={college.name}
          vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        />
      ) : null}
      {children}
      {session.impersonator ? <ViewAsBanner viewing={name} admin={session.impersonator.email} /> : null}
    </AppShell>
  );
}

/** The session carries the email only, so the name is one indexed read. */
async function fullName(uid: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ first: schema.users.firstName, last: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  const name = `${row?.first ?? ""} ${row?.last ?? ""}`.trim();
  return name || "Candidate";
}

