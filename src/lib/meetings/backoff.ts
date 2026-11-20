/** Retry schedule for fetching a transcript from Fireflies. Pure. attempt = how many tries have been made (1 = the first just failed). */
export const MAX_ATTEMPTS = 6;
const BASE_MS = 5 * 60_000;
const CAP_MS = 6 * 3_600_000;

/** 5 min, 10, 20, 40, 80 ... capped at 6 h; a Retry-After from Fireflies wins when it is longer. */
export function backoffMs(attempt: number, retryAfterMs: number | null = null): number {
  const exp = Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.max(exp, retryAfterMs ?? 0);
}

export type FailPlan = { status: "queued" | "failed"; nextAttemptAt: Date | null };

export function planFailure(attempt: number, retryable: boolean, retryAfterMs: number | null, now: Date): FailPlan {
  if (!retryable || attempt >= MAX_ATTEMPTS) return { status: "failed", nextAttemptAt: null };
  return { status: "queued", nextAttemptAt: new Date(now.getTime() + backoffMs(attempt, retryAfterMs)) };
}

/** Webhook body -> what to do. Only `meeting.transcribed` (and `.summarized`, to pick up a late summary) carry a transcript id we act on. */
export type WebhookAction = { kind: "fetch" | "resummarize"; id: string } | { kind: "ignore" };
export function readWebhook(body: unknown): WebhookAction {
  if (!body || typeof body !== "object") return { kind: "ignore" };
  const b = body as Record<string, unknown>;
  const id = typeof b.meeting_id === "string" ? b.meeting_id.trim() : "";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return { kind: "ignore" };
  if (b.event === "meeting.transcribed") return { kind: "fetch", id };
  if (b.event === "meeting.summarized") return { kind: "resummarize", id };
  return { kind: "ignore" };
}
