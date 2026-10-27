import { requireCollegeRead } from "@/lib/college/guard";
import { presenceSnapshot } from "@/lib/college/scope";
import { eligibleStudents, driveForCollegeAdmin } from "@/lib/college/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!drive) return new Response("Not found", { status: 404 });
    scope = (await eligibleStudents(drive)).map((s) => s.userId);
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = "";
  let lastSent = 0;

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
      const tick = async () => {
        try {
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
