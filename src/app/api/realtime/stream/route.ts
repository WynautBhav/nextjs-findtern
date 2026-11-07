import { and, asc, eq, gt, sql } from "drizzle-orm";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { KEEPALIVE_MS, MAX_EVENTS_PER_POLL, POLL_MS, parseCursor, shapeEvent } from "@/lib/realtime/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each open stream polls the database every 2 s: cap them per user, and end each after a few minutes so the
// browser reconnects (Last-Event-ID resumes) and the session is checked again.
const MAX_STREAMS_PER_USER = 3;
const MAX_STREAM_MS = 5 * 60_000;
const open = new Map<string, number>();

/**
 * SSE for the signed-in user: polls realtime_events past a per-connection
 * cursor every 2 s. `Last-Event-ID` resumes; with none, the stream starts at
 * "now" (history is the threads API's job). Read-only, so no CSRF guard.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.impersonator) return new Response("Unauthenticated", { status: 401 });
  const uid = session.uid;
  if ((open.get(uid) ?? 0) >= MAX_STREAMS_PER_USER) return new Response("Too many open streams", { status: 429 });
  open.set(uid, (open.get(uid) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (open.get(uid) ?? 1) - 1;
    if (n <= 0) open.delete(uid);
    else open.set(uid, n);
  };
  const db = getDb();

  let cursor = parseCursor(req.headers.get("last-event-id"));
  if (cursor === null) {
    try {
      const [m] = await db
        .select({ id: sql<number>`coalesce(max(${schema.realtimeEvents.id}), 0)::bigint` })
        .from(schema.realtimeEvents)
        .where(eq(schema.realtimeEvents.userId, uid));
      cursor = Number(m?.id ?? 0);
    } catch (err) {
      release();
      throw err;
    }
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let ender: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastSent = Date.now();
      const stop = () => {
        if (timer) clearInterval(timer);
        if (ender) clearTimeout(ender);
        timer = undefined;
        release();
        try {
          controller.close();
        } catch {}
      };
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
          lastSent = Date.now();
        } catch {
          stop();
        }
      };
      const tick = async () => {
        if (busy) return;
        busy = true;
        try {
          const rows = await db
            .select()
            .from(schema.realtimeEvents)
            .where(and(eq(schema.realtimeEvents.userId, uid), gt(schema.realtimeEvents.id, cursor!)))
            .orderBy(asc(schema.realtimeEvents.id))
            .limit(MAX_EVENTS_PER_POLL);
          for (const r of rows) {
            send(shapeEvent(r));
            cursor = r.id;
          }
          if (!rows.length && Date.now() - lastSent >= KEEPALIVE_MS) send(`: keepalive\n\n`);
        } catch (err) {
          console.error("[realtime-stream]", err);
        } finally {
          busy = false;
        }
      };
      req.signal.addEventListener("abort", stop);
      send(`retry: 3000\n\n`);
      timer = setInterval(tick, POLL_MS);
      ender = setTimeout(stop, MAX_STREAM_MS);
    },
    cancel() {
      if (timer) clearInterval(timer);
      if (ender) clearTimeout(ender);
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
