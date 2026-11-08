// Pure presence rules. Relative imports only: node:test runs this without the @ alias.
import { isOnline } from "./messaging/logic.ts";

/** What an employer-facing screen may say. `hidden` carries nothing: no timestamp, no online bit. */
export type PresenceView =
  | { state: "online" }
  | { state: "offline"; lastSeenAt: Date }
  | { state: "hidden" };

export type PresenceRow = { showActivity: boolean; lastSeenAt: Date | string | null };

/** The one label shown for a live heartbeat. */
export const PRESENCE_ONLINE = "Active now";
/** Past this, "Last seen 40d ago" stops being useful and says nothing about when: just "Offline". */
export const OFFLINE_AFTER_MS = 30 * 24 * 3_600_000;

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * The only place the hide setting is applied. No row (never seen), a hidden user and an unreadable timestamp all
 * give `hidden`, so an employer cannot tell "hid it" from "never opened the app". Stale heartbeats (older than
 * the 90 s online window) are offline, never online.
 */
export function presenceView(row: PresenceRow | null | undefined, now = Date.now()): PresenceView {
  if (!row || !row.showActivity || !row.lastSeenAt) return { state: "hidden" };
  const t = new Date(row.lastSeenAt).getTime();
  if (!Number.isFinite(t)) return { state: "hidden" };
  if (isOnline(row.lastSeenAt, now)) return { state: "online" };
  return { state: "offline", lastSeenAt: new Date(t) };
}

/** Coarse on purpose: nothing finer than five minutes, then hours, then days. */
export function lastSeenLabel(lastSeenAt: Date, now = Date.now()): string {
  const age = Math.max(0, now - lastSeenAt.getTime());
  if (age >= OFFLINE_AFTER_MS) return "Offline";
  if (age < 5 * MIN) return "Last seen a few minutes ago";
  if (age < HOUR) return `Last seen ${Math.floor(age / (5 * MIN)) * 5}m ago`;
  if (age < DAY) return `Last seen ${Math.floor(age / HOUR)}h ago`;
  return `Last seen ${Math.floor(age / DAY)}d ago`;
}

/** The label for a view, or null when there is nothing to show. */
export function presenceText(v: PresenceView, now = Date.now()): string | null {
  if (v.state === "online") return PRESENCE_ONLINE;
  if (v.state === "offline") return lastSeenLabel(v.lastSeenAt, now);
  return null;
}
