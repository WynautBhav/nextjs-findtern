import { isSafeLink } from "../safe-url.ts";

/** Pure rules for the AI-interview link queue (loader: ai-link-queue-load.ts). */

export type AiLinkRow = {
  interviewId: string;
  internId: string;
  status: string | null;
  meetingLink: string | null;
  createdAt: Date | string | null;
  paid: boolean;
};

export type AiLinkState = "waiting" | "sent" | "completed" | "closed";

const DAY_MS = 86_400_000;
const ms = (d: Date | string | null) => (d ? new Date(d).getTime() || 0 : 0);

export function aiLinkState(r: Pick<AiLinkRow, "status" | "meetingLink">): AiLinkState {
  const s = String(r.status ?? "").toLowerCase();
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "canceled" || s === "missed") return "closed";
  return String(r.meetingLink ?? "").trim() ? "sent" : "waiting";
}

/** Paid applicants with no link yet, oldest first; unpaid ones are counted apart (they can't take it). */
export function pickQueue<T extends AiLinkRow>(rows: T[]): { waiting: T[]; unpaid: number } {
  const open = rows.filter((r) => aiLinkState(r) === "waiting");
  return {
    waiting: open.filter((r) => r.paid).sort((a, b) => ms(a.createdAt) - ms(b.createdAt)),
    unpaid: open.filter((r) => !r.paid).length,
  };
}

export function daysWaiting(createdAt: Date | string | null, now: Date): number {
  const t = ms(createdAt);
  return t ? Math.max(0, Math.floor((now.getTime() - t) / DAY_MS)) : 0;
}

/** https only (the shared safe-url check, then no plain http). Other hosts pass with a soft warning. */
export function validateAiLink(raw: string): { ok: true; link: string; warning: string | null } | { ok: false; error: string } {
  const link = String(raw ?? "").trim();
  if (!link) return { ok: false, error: "Paste the InCruiter interview link." };
  let url: URL | null = null;
  try {
    url = new URL(link);
  } catch {
    // falls through to the error below
  }
  if (!url || !isSafeLink(link) || url.protocol !== "https:") return { ok: false, error: "Enter a full link starting with https://" };
  const host = url.hostname.toLowerCase();
  const incruiter = host === "incruiter.com" || host.endsWith(".incruiter.com");
  return { ok: true, link, warning: incruiter ? null : `This link is on ${host}, not incruiter.com. Check it is the right one.` };
}

/** The dedupe key of the "link is ready" notification, or null when nothing should be sent: a new or changed link notifies once. */
export function linkNoticeKey(interviewId: string, prev: string | null, next: string): string | null {
  const n = next.trim();
  if (!n || n === String(prev ?? "").trim()) return null;
  return `ai_interview_link:${interviewId}:${n}`;
}
