import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AppShell } from "@/components/app/shell";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
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

  return (
    <AppShell
      stage={data.stage}
      attentionHrefs={attentionHrefs}
      name={name}
      email={session.email}
      photoUrl={null}
    >
      {children}
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
