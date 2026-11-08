import type { Metadata } from "next";

import { Conversation } from "@/components/messaging/conversation";
import { MessagesShell } from "@/components/messaging/messages-shell";
import { getSession } from "@/lib/auth";
import { threadProposalCard } from "@/lib/messaging/proposal-card";

export const metadata: Metadata = { title: "Conversation", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const proposal = session ? await threadProposalCard(id, session.uid, "employer") : null;
  return (
    <MessagesShell base="employer" activeId={id}>
      <Conversation base="employer" threadId={id} proposal={proposal} />
    </MessagesShell>
  );
}
