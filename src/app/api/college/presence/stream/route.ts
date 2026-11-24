import { loadSessionFacts, passwordVersionCurrent } from "@/lib/account-status";
import { requireCollegeRead } from "@/lib/college/guard";
import { presenceSnapshot } from "@/lib/college/scope";
import { eligibleStudents, driveForCollegeAdmin } from "@/lib/college/scope";
import { driveDataOpen } from "@/lib/college/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel kills a function at maxDuration and logs "Task timed out", one error per stream. End the stream
 * ourselves a little earlier: EventSource reconnects after `retry:` and the client sees no gap.
 */
export const maxDuration = 300;
const STREAM_MAX_MS = 270_000;
const TICK_MS = 5_000;
const KEEPALIVE_MS = 20_000;

/**
 * Server-Sent Events: "490/500 online" for the placement officer.
 *
 * The heartbeat table is the source of truth, so this works with any number
 * of app instances; each stream re-reads it every TICK_MS and sends only when
 * the picture changes. One officer per college means a handful of streams,
 * not hundreds: the 500 students never hold a stream, they heartbeat.
 * `?drive=<id>` narrows to that drive's eligible students.
 */
export async function GET(req: Request) {
  const g = await requireCollegeRead();
  if (!g.ok) return g.response;
  const { ctx } = g;

  const driveId = new URL(req.url).searchParams.get("drive");
  let scope: string[] | undefined;
  if (driveId) {
    const drive = await driveForCollegeAdmin(ctx, driveId);
    // Presence is live-only: an ended or revoked drive has no live stream (its lists stay readable on the drive page).
    if (!drive || !driveDataOpen(drive)) return new Response("Not found", { status: 404 });
    scope = (await eligibleStudents(drive)).map((s) => s.userId);
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = "";
  let lastSent = 0;
  const { session } = ctx;
  /** The same facts getSession() checks per request (account-status.ts), read directly because cookies() is not available between ticks. */
  const sessionStillValid = async () => {
    const facts = await loadSessionFacts("college", session.uid, session.sid);
    return !facts.revoked && facts.active && passwordVersionCurrent("college", session.pv, facts.pv);
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
          lastSent = Date.now();
        } catch {
          stop();
        }
      };
      let busy = false;
      const tick = async () => {
        // A slow database must not stack ticks (each holds a pool connection while it runs); the connection is
        // released between ticks, nothing is held for the life of the stream.
        if (busy) return;
        busy = true;
        try {
          // The guard above ran when the stream opened. Re-check the account every tick: an officer or college switched
          // off, a reset password or a logout must end the stream, not leave names and roll numbers flowing for minutes.
          if (!(await sessionStillValid())) {
            send(`event: ended\ndata: {}\n\n`);
            stop();
            return;
          }
          const snap = await presenceSnapshot(ctx.college.id, scope);
          const key = `${snap.online}/${snap.total}/${snap.offline.map((o) => o.userId).join(",")}`;
          if (key !== last) {
            last = key;
            send(`event: presence\ndata: ${JSON.stringify(snap)}\n\n`);
          } else if (Date.now() - lastSent > KEEPALIVE_MS) {
            send(`: keepalive\n\n`);
          }
        } catch (err) {
          console.error("[presence-stream]", err);
        } finally {
          busy = false;
        }
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = undefined;
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", stop);
      send(`retry: 3000\n\n`);
      await tick();
      timer = setInterval(tick, TICK_MS);
      setTimeout(stop, STREAM_MAX_MS).unref?.();
    },
    cancel() {
      if (timer) clearInterval(timer);
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
