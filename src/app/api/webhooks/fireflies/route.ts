import { after, NextResponse } from "next/server";

import { readWebhook } from "@/lib/meetings/backoff";
import { verifyFirefliesSignature } from "@/lib/meetings/fireflies-signature";
import { enqueueTranscript, processTranscript, requeueForSummary } from "@/lib/meetings/transcripts-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fireflies Webhooks V2 (events meeting.transcribed / meeting.summarized). Closed unless FIREFLIES_WEBHOOK_SECRET is set; the body
 * must carry `X-Hub-Signature: sha256=<HMAC-SHA256 of the raw body>` or the answer is 401 and nothing is read. Then it only records the
 * transcript id (idempotent: a replay changes nothing) and answers; the fetch and flagging run right after the response and, if that
 * is cut short, in the sweeper. The body is never logged.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyFirefliesSignature(raw, req.headers.get("x-hub-signature"), process.env.FIREFLIES_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const action = readWebhook(body);
  if (action.kind === "ignore") return NextResponse.json({ ok: true, ignored: true });
  try {
    if (action.kind === "resummarize") {
      await requeueForSummary(action.id);
    } else {
      const created = await enqueueTranscript(action.id);
      if (!created) return NextResponse.json({ ok: true, duplicate: true });
    }
    after(() => processTranscript(action.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook:fireflies] store failed", e instanceof Error ? e.message : "error");
    // 500 makes Fireflies retry the delivery; the insert is idempotent.
    return NextResponse.json({ error: "Could not record" }, { status: 500 });
  }
}
