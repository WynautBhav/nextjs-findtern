import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";

import { InboxEmpty, InboxShell } from "@/components/app/messages/inbox-shell";
import { ThreadView } from "@/components/app/messages/thread-view";
import { requireRole } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { accountActive, counterpartOf, counterpartSeen, listThreads, threadFor, threadMessages, type Viewer } from "@/lib/messages";

/** A banned or deactivated account sees no conversations. */
const threadsOf = async (viewer: Viewer) => ((await accountActive(viewer)) ? listThreads(viewer) : []);

/** /{role}/messages layout: the list plus whatever is open beside it. */
export async function InboxLayout({ role, children }: { role: "intern" | "employer"; children: React.ReactNode }) {
  const session = await requireRole(role);
  const threads = await threadsOf({ role, id: session.uid });
  // An employer with no conversations is told whether to send a proposal or open one.
  // A failed read throws to the error page; it must not claim "no proposals".
  let hasProposals = false;
  if (role === "employer" && threads.length === 0) {
    const [row] = await getDb().select({ n: count() }).from(schema.proposals).where(eq(schema.proposals.employerId, session.uid));
    hasProposals = Number(row?.n ?? 0) > 0;
  }
  return (
    <InboxShell role={role} threads={threads} hasProposals={hasProposals}>
      {children}
    </InboxShell>
  );
}

/** /{role}/messages index: only visible beside the list on desktop. */
export async function InboxIndex({ role }: { role: "intern" | "employer" }) {
  const session = await requireRole(role);
  const threads = await threadsOf({ role, id: session.uid });
  return <InboxEmpty hasThreads={threads.length > 0} />;
}

/** /{role}/messages/[id]: a participant reads the thread; anyone else gets the 404 page. */
export async function ThreadPage({ role, id }: { role: "intern" | "employer"; id: string }) {
  const session = await requireRole(role);
  const viewer = { role, id: session.uid } as const;
  const thread = await threadFor(viewer, id);
  if (!thread || !(await accountActive(viewer))) notFound();
  const who = await counterpartOf(viewer, thread);
  const messages = await threadMessages(viewer, thread, null, who.unlocked);
  return (
    <ThreadView
      role={role}
      threadId={thread.id}
      initialMessages={messages}
      initialSeen={await counterpartSeen(viewer, thread)}
      name={who.name}
      roleTitle={who.roleTitle}
      initialPresence={who.presence}
      contactLocked={!who.unlocked}
      closed={Boolean(thread.closedAt)}
    />
  );
}
