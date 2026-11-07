import type { Metadata } from "next";

import { Conversation } from "@/components/messaging/conversation";
import { MessagesShell } from "@/components/messaging/messages-shell";

export const metadata: Metadata = { title: "Conversation", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="rise">
      <MessagesShell base="intern" activeId={id}>
        <Conversation base="intern" threadId={id} />
      </MessagesShell>
    </div>
  );
}
