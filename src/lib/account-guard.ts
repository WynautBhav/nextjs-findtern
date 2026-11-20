import { ACCOUNT_DISABLED_CODE } from "./account-disabled.ts";
import { ACCOUNT_ON_HOLD_CODE } from "./account-hold.ts";

/**
 * Pure rules for the open-tab watcher (components/app/account-guard.tsx): when a tab should ask the server whether its
 * account is still enabled, and how to read the answer. Kept free of the DOM so it can be tested.
 */

/** How often a visible tab asks. Hidden tabs do not poll at all; they ask once on becoming visible. */
export const POLL_MS = 12_000;
/** A tab skips its poll when another tab (same browser) asked within this long. Less than POLL_MS, so one tab always keeps it going. */
export const SHARE_MS = 8_000;
/** How long after a navigation was requested the blocking notice appears if the page is still here. */
export const NOTICE_AFTER_MS = 4_000;

export const CLAIM_KEY = "ft:status-check";
export const DISABLED_KEY = "ft:account-disabled";
export const CHANNEL = "ft-account";

/** Whether this tab should call the status route now. `lastClaim` is the newest claim by any tab (ms), or null. */
export function shouldPoll(o: { now: number; lastClaim: number | null; visible: boolean; force?: boolean }): boolean {
  if (!o.visible) return false;
  if (o.force) return true; // focus / becoming visible: ask at once, whoever asked last
  return o.lastClaim === null || o.now - o.lastClaim >= SHARE_MS || o.lastClaim > o.now;
}

export type StatusVerdict = "ok" | "disabled" | "held" | "unknown";

/** 200 = fine; 403 with the machine code = disabled (or on hold, an admin froze it); anything else (401, 5xx, network) = do nothing. */
export function statusVerdict(status: number, body: unknown): StatusVerdict {
  if (status >= 200 && status < 300) return "ok";
  if (status === 403 && typeof body === "object" && body !== null && (body as { code?: unknown }).code === ACCOUNT_DISABLED_CODE) return "disabled";
  if (status === 403 && typeof body === "object" && body !== null && (body as { code?: unknown }).code === ACCOUNT_ON_HOLD_CODE) return "held";
  return "unknown";
}

/** A signal another tab left behind: only the current sign-in's role matters, and only a recent one. */
export function disabledSignalApplies(raw: string | null, role: string, now: number, maxAgeMs = 60_000): boolean {
  if (!raw) return false;
  try {
    const v = JSON.parse(raw) as { role?: unknown; at?: unknown };
    return v.role === role && typeof v.at === "number" && now - v.at >= 0 && now - v.at < maxAgeMs;
  } catch {
    return false;
  }
}
