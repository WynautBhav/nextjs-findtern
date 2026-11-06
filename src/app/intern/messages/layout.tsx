import { InboxLayout } from "@/components/app/messages/inbox-server";

export const metadata = { title: "Messages", robots: { index: false, follow: false } };

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <InboxLayout role="intern">{children}</InboxLayout>;
}
