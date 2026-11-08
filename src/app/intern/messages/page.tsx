import type { Metadata } from "next";

import { MessagesShell } from "@/components/messaging/messages-shell";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default function MessagesPage() {
  return <MessagesShell base="intern" />;
}
