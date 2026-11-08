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

/** Keys that carry another user's activity. Presence is read from the threads/candidate APIs, where the hide setting is enforced; never over the wire here. */
const PRESENCE_KEYS = /^(last_?seen(_?at)?|online|is_?online|presence|show_?activity|counterpart_?(online|presence))$/i;

/** Drops presence fields at any depth, so a stream event can never leak last seen or the hide setting. */
export function scrubPresence(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrubPresence);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !PRESENCE_KEYS.test(k)).map(([k, x]) => [k, scrubPresence(x)]));
  }
  return v;
}

/** One SSE frame; the id lets the browser resume with Last-Event-ID. A presence.changed frame is only a nudge to refetch: its payload is always empty. */
export function shapeEvent(e: { id: number | string; type: string; payload: unknown }): string {
  const type = String(e.type).replace(/[\r\n]/g, "");
  const payload = type === "presence.changed" ? {} : scrubPresence(e.payload ?? {});
  return `id: ${e.id}\nevent: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/** Exponential backoff for reconnects, capped, no jitter needed at this scale. */
export function backoffMs(attempt: number, base = 1_000, cap = 30_000): number {
  return Math.min(cap, base * 2 ** Math.max(0, attempt));
}
