// Pure UI helpers for messaging. Relative imports only: node:test runs this without the @ alias.

export type ThreadRow = {
  id: string;
  proposalId: string | null;
  counterpartId: string;
  /** True only when the counterpart is active now and has not hidden it. */
  counterpartOnline: boolean;
  /** "Active now" / "Last seen 2h ago" / "Offline"; null when hidden or never seen: show nothing. */
  counterpartPresence: string | null;
  lastMessage: { body: string; mine: boolean; createdAt: string } | null;
  lastMessageAt: string | null;
  unread: number;
  /** Row 25. Employer view: initials, or the full name after hire. Intern view: the company name after hire, else null. */
  counterpartName: string | null;
  /** The project the thread's proposal is for. */
  projectName: string | null;
  /** Rows 11 and 24: why the viewer cannot send right now, or null. */
  sendBlock: "closed" | "employer_first" | null;
};

export type Msg = {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  /** Client-only state for optimistic sends. */
  pending?: boolean;
  failed?: boolean;
};

/** "now", "5m", "3h", "2d", else a short date. Future/invalid times read "now". */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Single-line plain-text preview: whitespace collapsed, cut at `max` characters (by code point) with an ellipsis. */
export function truncatePreview(body: string, max = 80): string {
  const flat = String(body ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

export function badgeText(n: number): string {
  return n > 99 ? "99+" : String(Math.max(0, Math.floor(n)));
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const n = new Date(now);
  if (localDay(d) === localDay(n)) return "Today";
  if (localDay(d) === localDay(new Date(now - 86400000))) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: d.getFullYear() === n.getFullYear() ? undefined : "numeric" });
}

/** Groups messages (already in time order) by local calendar day. */
export function groupByDay<T extends { createdAt: string }>(msgs: T[], now = Date.now()): { key: string; label: string; items: T[] }[] {
  const out: { key: string; label: string; items: T[] }[] = [];
  for (const m of msgs) {
    const d = new Date(m.createdAt);
    const key = Number.isNaN(d.getTime()) ? "unknown" : localDay(d);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(m);
    else out.push({ key, label: dayLabel(m.createdAt, now), items: [m] });
  }
  return out;
}

export function totalUnread(threads: ThreadRow[]): number {
  return threads.reduce((n, t) => n + Math.max(0, t.unread), 0);
}

/**
 * Folds a realtime event into the thread list. message.new bumps unread
 * (unless `openThreadId` is the thread, which is being read right now).
 * Returns the same array when nothing changed, and `refetch: true` when the
 * thread is unknown and the list must be reloaded.
 */
export function applyThreadEvent(
  threads: ThreadRow[],
  ev: { type: string; data: unknown },
  openThreadId: string | null = null,
): { threads: ThreadRow[]; refetch: boolean } {
  const d = (ev.data ?? {}) as { threadId?: unknown; createdAt?: unknown };
  const threadId = typeof d.threadId === "string" ? d.threadId : null;
  if (!threadId) return { threads, refetch: false };
  if (ev.type === "message.new") {
    if (!threads.some((t) => t.id === threadId)) return { threads, refetch: true };
    const at = typeof d.createdAt === "string" ? d.createdAt : new Date().toISOString();
    const next = threads.map((t) =>
      t.id === threadId ? { ...t, unread: openThreadId === threadId ? t.unread : t.unread + 1, lastMessageAt: at } : t,
    );
    // Newest conversation first; a preview body is not in the event, so the caller refetches to fill it.
    next.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
    return { threads: next, refetch: true };
  }
  return { threads, refetch: false };
}

export function markThreadRead(threads: ThreadRow[], threadId: string): ThreadRow[] {
  return threads.some((t) => t.id === threadId && t.unread > 0)
    ? threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t))
    : threads;
}

/** Replaces the optimistic message `tempId` with the server's, or drops it when the server copy already arrived via the stream. */
export function reconcileSent(msgs: Msg[], tempId: string, server: Msg): Msg[] {
  const have = msgs.some((m) => m.id === server.id);
  if (have) return msgs.filter((m) => m.id !== tempId);
  return msgs.map((m) => (m.id === tempId ? { ...server, pending: false, failed: false } : m));
}

export function failSent(msgs: Msg[], tempId: string): Msg[] {
  return msgs.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m));
}

export function removeMsg(msgs: Msg[], id: string): Msg[] {
  return msgs.filter((m) => m.id !== id);
}

/** Appends unseen messages by id, keeping time order. */
export function mergeMessages(msgs: Msg[], incoming: Msg[]): Msg[] {
  const ids = new Set(msgs.map((m) => m.id));
  const add = incoming.filter((m) => !ids.has(m.id));
  if (!add.length) return msgs;
  return [...msgs, ...add].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Other side read the thread: every one of my sent messages becomes read. */
export function markMineRead(msgs: Msg[], at = new Date().toISOString()): Msg[] {
  return msgs.map((m) => (m.mine && !m.pending && !m.failed && !m.readAt ? { ...m, readAt: at, deliveredAt: m.deliveredAt ?? at } : m));
}

export function statusText(m: Msg): string {
  if (m.failed) return "Not sent";
  if (m.pending) return "Sending";
  return m.readAt ? "Read" : m.deliveredAt ? "Delivered" : "Sent";
}

/** Display identity for the other side. The threads API returns ids only (no names), so this is a generic word plus a short ref from the id; `label` includes the ref, `word` does not. */
export function counterpartIdentity(base: "employer" | "intern", id: string): { word: string; code: string; label: string; initials: string } {
  const code = String(id ?? "").replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() || "----";
  const word = base === "employer" ? "Candidate" : "Company";
  return { word, code, label: `${word} ${code}`, initials: `${word[0]}${code[0]}` };
}

/** Splits time-ordered messages into runs: same sender and no longer than `gapMs` between neighbours. */
export function senderRuns<T extends { mine: boolean; createdAt: string }>(msgs: T[], gapMs = 10 * 60_000): { mine: boolean; items: T[] }[] {
  const out: { mine: boolean; items: T[] }[] = [];
  let prev = 0;
  for (const m of msgs) {
    const t = new Date(m.createdAt).getTime();
    const last = out[out.length - 1];
    if (last && last.mine === m.mine && Number.isFinite(t) && t - prev <= gapMs) last.items.push(m);
    else out.push({ mine: m.mine, items: [m] });
    prev = t;
  }
  return out;
}

/** What the proposal card in a thread shows. Drafts are never shown to the intern; the loader returns null for them. */
export type ProposalCardData = { id: string; title: string; status: string; duration: string | null };

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Awaiting reply",
  interview_scheduled: "Interview scheduled",
  accepted: "Accepted",
  hired: "Hired",
  rejected: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export function proposalStatusLabel(status: string): string {
  return PROPOSAL_STATUS_LABEL[status] ?? "In progress";
}

/** "3m" -> "3 months", "1m" -> "1 month"; anything else is not shown. */
export function durationLabel(raw: unknown): string | null {
  const m = /^(\d{1,2})\s*m$/i.exec(String(raw ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? `${n} ${n === 1 ? "month" : "months"}` : null;
}

/**
 * What to call the other side in a thread (row 25). The server sends `counterpartName` (employer view: initials,
 * or the full name after hire) and `projectName` (intern view, company name only after hire). The id-based
 * label is the fallback when the server had nothing.
 */
export function threadTitle(
  base: "employer" | "intern",
  t: { counterpartId: string; counterpartName?: string | null; projectName?: string | null } | null | undefined,
  fallbackId = "",
): { title: string; subtitle: string | null; initials: string } {
  const ident = counterpartIdentity(base, t?.counterpartId ?? fallbackId);
  const name = t?.counterpartName?.trim() || null;
  const project = t?.projectName?.trim() || null;
  if (base === "employer") {
    const title = name ?? ident.label;
    return { title, subtitle: project, initials: name ? name.replace(/[^\p{L}]/gu, "").slice(0, 2).toUpperCase() || ident.initials : ident.initials };
  }
  const title = name ?? project ?? ident.label;
  const subtitle = name && project ? project : null;
  return { title, subtitle, initials: (title.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2) || ident.initials).toUpperCase() };
}
