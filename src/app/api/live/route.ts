import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { countsFor } from "@/lib/live-counts";
import { accountActive, latestThread } from "@/lib/messages";
import { ConcurrencyLimiter, RateLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICK_MS = 3_000;
const KEEPALIVE_MS = 20_000;
/** Close a little before maxDuration so the browser reconnects (retry: 3000) instead of being cut off. */
const LIFETIME_MS = 55_000;
/** Re-check the account (ban, deactivation) every this many ticks. */
const RECHECK_TICKS = 5;
/** One stream per open tab; more than this from one account is a leak or abuse. */
const streams = new ConcurrencyLimiter(5);
/** The polling fallback runs every 15 s per tab; 60 leaves room for many tabs. */
const polls = new RateLimiter(60, 60_000, { bypassable: false });

/**
 * Live counts for the header badges and toasts: Server-Sent Events, one
 * stream per open tab. The database is the source of truth, so any number of
 * instances works; each stream re-reads four indexed queries every TICK_MS and
 * sends only when something changed. `?once=1` is the same data as JSON for
 * the polling fallback. A View as admin reads as that person.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.role !== "intern" && session.role !== "employer") return NextResponse.json({ error: "Insufficient role" }, { status: 403 });
  const viewer = { role: session.role, id: session.uid } as const;
  if (!(await accountActive(viewer))) return NextResponse.json({ error: "Account inactive" }, { status: 403 });

  if (new URL(req.url).searchParams.get("once") === "1") {
    if (!polls.take(viewer.id)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(polls.retryAfterSeconds(viewer.id)) } });
    return NextResponse.json(await countsFor(viewer.role, viewer.id), { headers: { "Cache-Control": "no-store" } });
  }

  const release = streams.acquire(viewer.id);
  if (!release) return NextResponse.json({ error: "Too many open streams" }, { status: 429, headers: { "Retry-After": "30" } });

  const encoder = new TextEncoder();
  let ticks = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ender: ReturnType<typeof setTimeout> | undefined;
  let lastCounts = "";
  let lastMessageAt: string | null = null;
  let first = true;
  let busy = false;
  let lastSent = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const stop = () => {
        if (timer) clearInterval(timer);
        if (ender) clearTimeout(ender);
        timer = ender = undefined;
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
        // A slow database must not stack ticks.
        if (busy) return;
        busy = true;
        try {
          if (++ticks % RECHECK_TICKS === 0 && !(await accountActive(viewer))) return stop();
          const counts = await countsFor(viewer.role, viewer.id);
          const key = JSON.stringify(counts);
          let sent = false;
          if (key !== lastCounts) {
            lastCounts = key;
            send(`event: counts\ndata: ${key}\n\n`);
            sent = true;
          }
          // The first tick only sets the baseline; a `message` event means a newer message landed since.
          // `counts.lastMessageAt` already says when; look up which thread only when it moved.
          if (counts.lastMessageAt !== lastMessageAt) {
            lastMessageAt = counts.lastMessageAt;
            const thread = first ? null : await latestThread(viewer);
            if (thread) {
              send(`event: message\ndata: ${JSON.stringify(thread)}\n\n`);
              sent = true;
            }
          }
          first = false;
          if (!sent && Date.now() - lastSent > KEEPALIVE_MS) send(`: keepalive\n\n`);
        } catch (err) {
          console.error("[live]", err);
        } finally {
          busy = false;
        }
      };
      req.signal.addEventListener("abort", stop);
      send(`retry: 3000\n\n`);
      await tick();
      timer = setInterval(tick, TICK_MS);
      ender = setTimeout(stop, LIFETIME_MS);
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
