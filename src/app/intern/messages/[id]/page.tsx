import { ThreadPage } from "@/components/app/messages/inbox-server";

export default async function MessageThread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ThreadPage role="intern" id={id} />;
}
