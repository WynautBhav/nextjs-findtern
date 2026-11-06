import { notFound } from "next/navigation";

import { InboxEmpty, InboxShell } from "@/components/app/messages/inbox-shell";
import { ThreadView } from "@/components/app/messages/thread-view";
import { requireRole } from "@/lib/auth";
import { counterpartOf, counterpartReadAt, listThreads, threadFor, threadMessages } from "@/lib/messages";

/** /{role}/messages layout: the list plus whatever is open beside it. */
export async function InboxLayout({ role, children }: { role: "intern" | "employer"; children: React.ReactNode }) {
  const session = await requireRole(role);
  const threads = await listThreads({ role, id: session.uid });
  return (
    <InboxShell role={role} threads={threads}>
      {children}
    </InboxShell>
  );
}

/** /{role}/messages index: only visible beside the list on desktop. */
export async function InboxIndex({ role }: { role: "intern" | "employer" }) {
  const session = await requireRole(role);
  const threads = await listThreads({ role, id: session.uid });
  return <InboxEmpty hasThreads={threads.length > 0} />;
}

/** /{role}/messages/[id]: a participant reads the thread; anyone else gets the 404 page. */
export async function ThreadPage({ role, id }: { role: "intern" | "employer"; id: string }) {
  const session = await requireRole(role);
  const viewer = { role, id: session.uid } as const;
  const thread = await threadFor(viewer, id);
  if (!thread) notFound();
  const [messages, who] = await Promise.all([threadMessages(viewer, thread), counterpartOf(viewer, thread)]);
  return (
    <ThreadView
      role={role}
      threadId={thread.id}
      initialMessages={messages}
      initialReadAt={counterpartReadAt(viewer, thread)}
      name={who.name}
      roleTitle={who.roleTitle}
      initialPresence={who.presence}
      contactLocked={!who.unlocked}
      closed={Boolean(thread.closedAt)}
    />
  );
}
