export const REALTIME_EVENT_TYPES = ["message.new", "message.read", "proposal.updated", "notification.new", "presence.changed"] as const;
export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export const POLL_MS = 2_000;
export const KEEPALIVE_MS = 25_000;
export const MAX_EVENTS_PER_POLL = 100;

/** Cursor from the Last-Event-ID header: a non-negative integer, else null. */
export function parseCursor(v: string | null | undefined): number | null {
  if (!v || !/^\d{1,15}$/.test(v)) return null;
  return Number(v);
}

/** One SSE frame; the id lets the browser resume with Last-Event-ID. */
export function shapeEvent(e: { id: number | string; type: string; payload: unknown }): string {
  const type = String(e.type).replace(/[\r\n]/g, "");
  return `id: ${e.id}\nevent: ${type}\ndata: ${JSON.stringify(e.payload ?? {})}\n\n`;
}

/** Exponential backoff for reconnects, capped, no jitter needed at this scale. */
export function backoffMs(attempt: number, base = 1_000, cap = 30_000): number {
  return Math.min(cap, base * 2 ** Math.max(0, attempt));
}
