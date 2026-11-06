import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getDb, schema } from "./db/index.ts";
import { initialsOf } from "./employer-candidates.ts";
import { emails, origin, renderEmail } from "./emails.ts";
import { scrubContact } from "./contact-scrub.ts";
import { ONLINE_ACTIVE_MS, presenceLabel, presenceOf, type PresenceLabel } from "./presence.ts";
import { RateLimiter } from "./security/rate-limit.ts";

/**
 * Employer–intern messaging (OA1). One thread per pair, opened from a
 * proposal; both sides stay masked and phone numbers, emails and links are
 * hidden until a paid hire exists. Everything here takes a `Viewer` and
 * answers 404 to anyone who is not one of the two participants, so a thread
 * id is never worth guessing.
 *
 * The rules that decide something (who may read, what is stored, when an
 * email goes out) are small pure functions at the top so they are unit tested
 * without a database. Modules that pull in the session (`messages-access`,
 * `notify`, `employer-visibility`) are loaded on first use for the same reason.
 */

export type Viewer = { role: "intern" | "employer"; id: string };

export const MAX_BODY = 2000;
export const PAGE_SIZE = 100;
export const COMPANY_MASK = "A company on Findtern";
/** Opening a thread needs a proposal that was actually sent, not a draft. */
export const NOT_OPEN_YET = "Messaging opens once a proposal is sent.";

/** A refusal the route turns into `{ error }` with this status. */
export class MessageError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function messageErrorResponse(err: unknown): Response {
  if (err instanceof MessageError) return Response.json({ error: err.message }, { status: err.status });
  throw err;
}

// Per instance on Vercel; abuse damping only. `messages_client_uniq` is what stops duplicates.
const perMinute = new RateLimiter(20, 60_000, { bypassable: false });
const perDay = new RateLimiter(200, 24 * 60 * 60_000, { bypassable: false });

/* ── Pure rules ─────────────────────────────────────────────────────────── */

type Pair = { employerId: string; internId: string };

export function isParticipant(thread: Pair, viewer: Viewer): boolean {
  return viewer.role === "employer" ? thread.employerId === viewer.id : thread.internId === viewer.id;
}

/** What is stored: contact details are replaced unless the hire is paid. */
export function bodyToStore(body: string, contactUnlocked: boolean): { text: string; redacted: boolean } {
  return contactUnlocked ? { text: body, redacted: false } : scrubContact(body);
}

/** At most one email per thread and recipient in this window, whatever else says "due". */
export const MIN_EMAIL_GAP_MS = 15 * 60_000;

/**
 * Someone who read this thread in the last 2 minutes is in the conversation,
 * even when they have no presence row (employers never do) or sit in a
 * background tab: treat them as online.
 */
export function effectivePresence(presence: PresenceLabel | null, lastReadAt: Date | null, now: Date = new Date()): PresenceLabel | null {
  if (lastReadAt && now.getTime() - lastReadAt.getTime() < ONLINE_ACTIVE_MS) return "Online now";
  return presence;
}

/**
 * One email per unread burst, and only when the recipient is not online. A
 * burst ends when the recipient reads the thread: the stamp must be older than
 * their last read to mail again, and never within MIN_EMAIL_GAP_MS of the last
 * mail, so reading between messages cannot turn a chat into one email each.
 */
export function emailDue(o: {
  recipientPresence: PresenceLabel | null;
  emailedAt: Date | null;
  lastReadAt: Date | null;
  now?: Date;
}): boolean {
  if (o.recipientPresence === "Online now") return false;
  if (!o.emailedAt) return true;
  if ((o.now ?? new Date()).getTime() - o.emailedAt.getTime() < MIN_EMAIL_GAP_MS) return false;
  return o.lastReadAt !== null && o.emailedAt < o.lastReadAt;
}

/**
 * What the reader sees. Contact details are scrubbed on send, but a body
 * stored after a hire that is later undone, or under an older scrubber, must
 * not leak: while locked, scrub again (regex only, and a no-op on clean text).
 */
export function bodyToShow(body: string, storedRedacted: boolean, unlocked: boolean): { body: string; redacted: boolean } {
  if (unlocked) return { body, redacted: storedRedacted };
  const s = scrubContact(body);
  return { body: s.text, redacted: storedRedacted || s.redacted };
}

const other = (role: Viewer["role"]) => (role === "intern" ? "employer" : "intern");

/* ── Reads ──────────────────────────────────────────────────────────────── */

export type ThreadRow = typeof schema.messageThreads.$inferSelect;

/** The thread, or null when it does not exist or the viewer is not in it. */
export async function threadFor(viewer: Viewer, id: string): Promise<ThreadRow | null> {
  if (!id || id.length > 80) return null;
  const t = schema.messageThreads;
  const [row] = await getDb().select().from(t).where(eq(t.id, id)).limit(1);
  return row && isParticipant(row, viewer) ? row : null;
}

export type MessageView = { id: string; mine: boolean; body: string; redacted: boolean; createdAt: string };

/** The latest page, or the messages after `after` (oldest first). */
export async function threadMessages(viewer: Viewer, thread: ThreadRow, after: string | null | undefined, unlocked: boolean): Promise<MessageView[]> {
  const m = schema.messages;
  const db = getDb();
  const cols = { id: m.id, senderType: m.senderType, body: m.body, redacted: m.redacted, createdAt: m.createdAt };
  let rows;
  if (after) {
    // Row comparison in SQL: a JS Date would drop the microseconds and re-send the anchor.
    rows = await db
      .select(cols)
      .from(m)
      .where(
        and(
          eq(m.threadId, thread.id),
          sql`(${m.createdAt}, ${m.id}) > (SELECT created_at, id FROM messages WHERE id = ${after} AND thread_id = ${thread.id})`,
        ),
      )
      .orderBy(asc(m.createdAt), asc(m.id))
      .limit(PAGE_SIZE);
    if (rows.length === 0) {
      const [anchor] = await db.select({ id: m.id }).from(m).where(and(eq(m.id, after), eq(m.threadId, thread.id))).limit(1);
      // An unknown anchor falls back to the latest page; the client dedupes by id.
      if (!anchor) return threadMessages(viewer, thread, null, unlocked);
    }
  } else {
    rows = (await db.select(cols).from(m).where(eq(m.threadId, thread.id)).orderBy(desc(m.createdAt), desc(m.id)).limit(PAGE_SIZE)).reverse();
  }
  return rows.map((r) => ({
    id: r.id,
    mine: r.senderType === viewer.role,
    ...bodyToShow(r.body, r.redacted, unlocked),
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/** "Seen" only: the exact read time is never sent, and an intern who hides presence is never "seen" (OA2). */
export function seenFrom(readAt: Date | null, lastMineAt: Date | null, hidden: boolean): boolean {
  return !hidden && readAt !== null && lastMineAt !== null && readAt.getTime() >= lastMineAt.getTime();
}

export async function counterpartSeen(viewer: Viewer, thread: ThreadRow): Promise<boolean> {
  const readAt = viewer.role === "employer" ? thread.internLastReadAt : thread.employerLastReadAt;
  if (!readAt) return false;
  const db = getDb();
  const m = schema.messages;
  const [last] = await db
    .select({ at: m.createdAt })
    .from(m)
    .where(and(eq(m.threadId, thread.id), eq(m.senderType, viewer.role)))
    .orderBy(desc(m.createdAt))
    .limit(1);
  let hidden = false;
  if (viewer.role === "employer") {
    const p = schema.userPresence;
    const [row] = await db.select({ hidden: p.hidden }).from(p).where(and(eq(p.userType, "intern"), eq(p.userId, thread.internId))).limit(1);
    hidden = Boolean(row?.hidden);
  }
  return seenFrom(new Date(readAt), last ? new Date(last.at) : null, hidden);
}

export type Counterpart = { name: string; presence: PresenceLabel | null; roleTitle: string | null };

/** Employers see initials until the hire; interns see "A company on Findtern" and the role. */
export async function counterpartOf(viewer: Viewer, thread: ThreadRow): Promise<Counterpart & { unlocked: boolean }> {
  const db = getDb();
  const { contactUnlocked } = await import("./messages-access.ts");
  const unlocked = await contactUnlocked(thread.employerId, thread.internId);
  // The pair's newest sent proposal, not the one that opened the thread.
  const [role] = await db
    .select({ name: schema.projects.projectName })
    .from(schema.proposals)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .where(and(eq(schema.proposals.employerId, thread.employerId), eq(schema.proposals.internId, thread.internId), ne(schema.proposals.status, "draft")))
    .orderBy(desc(schema.proposals.createdAt))
    .limit(1);
  const roleTitle = role?.name?.trim() || null;

  if (viewer.role === "employer") {
    const [u] = await db
      .select({ first: schema.users.firstName, last: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, thread.internId))
      .limit(1);
    const first = u?.first ?? "";
    const last = u?.last ?? "";
    const name = unlocked ? `${first} ${last}`.trim() || "Intern" : initialsOf(first, last);
    return { name, presence: (await presenceOf([thread.internId]))[thread.internId] ?? null, roleTitle, unlocked };
  }
  const [e] = await db.select({ company: schema.employers.companyName }).from(schema.employers).where(eq(schema.employers.id, thread.employerId)).limit(1);
  return { name: unlocked && e?.company ? e.company : COMPANY_MASK, presence: null, roleTitle, unlocked };
}

export type ThreadSummary = {
  id: string;
  name: string;
  roleTitle: string | null;
  presence: PresenceLabel | null;
  preview: string | null;
  lastMine: boolean;
  lastAt: string | null;
  unread: number;
};

/** The inbox: newest conversation first, with the last message and what is unread. */
export async function listThreads(viewer: Viewer): Promise<ThreadSummary[]> {
  const db = getDb();
  const t = schema.messageThreads;
  const m = schema.messages;
  const mineCol = viewer.role === "intern" ? t.internId : t.employerId;
  const lastRead = viewer.role === "intern" ? t.internLastReadAt : t.employerLastReadAt;
  const threads = await db
    .select()
    .from(t)
    .where(eq(mineCol, viewer.id))
    .orderBy(sql`coalesce(${t.lastMessageAt}, ${t.createdAt}) DESC`)
    .limit(PAGE_SIZE);
  if (threads.length === 0) return [];
  const ids = threads.map((x) => x.id);

  const { hiredProposalSql } = await import("./employer-visibility.ts");
  const p = schema.proposals;
  const [lasts, unreads, hired, roles] = await Promise.all([
    db
      .selectDistinctOn([m.threadId], { threadId: m.threadId, body: m.body, senderType: m.senderType, at: m.createdAt })
      .from(m)
      .where(inArray(m.threadId, ids))
      .orderBy(m.threadId, desc(m.createdAt), desc(m.id)),
    db
      .select({ threadId: m.threadId, n: sql<number>`count(*)::int` })
      .from(m)
      .innerJoin(t, eq(t.id, m.threadId))
      .where(and(inArray(m.threadId, ids), ne(m.senderType, viewer.role), or(isNull(lastRead), gt(m.createdAt, lastRead))))
      .groupBy(m.threadId),
    db
      .select({ employerId: p.employerId, internId: p.internId })
      .from(p)
      .where(and(viewer.role === "employer" ? eq(p.employerId, viewer.id) : eq(p.internId, viewer.id), hiredProposalSql())),
    // Newest sent proposal per pair, so a later role shows its own title.
    db
      .selectDistinctOn([p.employerId, p.internId], { employerId: p.employerId, internId: p.internId, name: schema.projects.projectName })
      .from(p)
      .leftJoin(schema.projects, eq(schema.projects.id, p.projectId))
      .where(
        and(
          viewer.role === "employer" ? eq(p.employerId, viewer.id) : eq(p.internId, viewer.id),
          inArray(viewer.role === "employer" ? p.internId : p.employerId, threads.map((x) => (viewer.role === "employer" ? x.internId : x.employerId))),
          ne(p.status, "draft"),
        ),
      )
      .orderBy(p.employerId, p.internId, desc(p.createdAt)),
  ]);

  // Counterparts this viewer has a paid hire with: unmasked, and their contact details stay readable.
  const hiredWith = new Set(hired.map((h) => (viewer.role === "employer" ? h.internId : h.employerId)));
  const counterIds = threads.map((x) => (viewer.role === "employer" ? x.internId : x.employerId));
  const names = new Map<string, string>();
  if (viewer.role === "employer") {
    const rows = await db
      .select({ id: schema.users.id, first: schema.users.firstName, last: schema.users.lastName })
      .from(schema.users)
      .where(inArray(schema.users.id, counterIds));
    for (const r of rows) names.set(r.id, hiredWith.has(r.id) ? `${r.first} ${r.last}`.trim() || "Intern" : initialsOf(r.first, r.last));
  } else {
    const rows = await db.select({ id: schema.employers.id, company: schema.employers.companyName }).from(schema.employers).where(inArray(schema.employers.id, counterIds));
    for (const r of rows) names.set(r.id, hiredWith.has(r.id) && r.company ? r.company : COMPANY_MASK);
  }
  const presence = viewer.role === "employer" ? await presenceOf(counterIds) : {};
  const lastBy = new Map(lasts.map((l) => [l.threadId, l]));
  const unreadBy = new Map(unreads.map((u) => [u.threadId, Number(u.n)]));
  const roleBy = new Map(roles.map((r) => [`${r.employerId}:${r.internId}`, r.name?.trim() || null]));

  return threads.map((x) => {
    const counter = viewer.role === "employer" ? x.internId : x.employerId;
    const last = lastBy.get(x.id);
        return {
      id: x.id,
      name: names.get(counter) ?? (viewer.role === "employer" ? "Candidate" : COMPANY_MASK),
      roleTitle: roleBy.get(`${x.employerId}:${x.internId}`) ?? null,
      presence: presence[counter] ?? null,
      preview: last ? bodyToShow(last.body, false, hiredWith.has(counter)).body : null,
      lastMine: last ? last.senderType === viewer.role : false,
      lastAt: last ? new Date(last.at).toISOString() : null,
      unread: unreadBy.get(x.id) ?? 0,
    };
  });
}

/** The newest conversation of this user, for the live stream's `message` event. */
export async function latestThread(viewer: Viewer): Promise<{ threadId: string; at: string } | null> {
  const t = schema.messageThreads;
  const mineCol = viewer.role === "intern" ? t.internId : t.employerId;
  const [row] = await getDb()
    .select({ id: t.id, at: t.lastMessageAt })
    .from(t)
    .where(and(eq(mineCol, viewer.id), sql`${t.lastMessageAt} IS NOT NULL`))
    .orderBy(desc(t.lastMessageAt))
    .limit(1);
  return row?.at ? { threadId: row.id, at: new Date(row.at).toISOString() } : null;
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

/** Banned or deactivated accounts cannot start or send. */
async function assertMayWrite(viewer: Viewer): Promise<void> {
  const db = getDb();
  const ok =
    viewer.role === "intern"
      ? await db.select({ a: schema.users.isActive, b: schema.users.bannedAt }).from(schema.users).where(eq(schema.users.id, viewer.id)).limit(1).then(([r]) => Boolean(r?.a && !r.b))
      : await db.select({ a: schema.employers.isActive }).from(schema.employers).where(eq(schema.employers.id, viewer.id)).limit(1).then(([r]) => Boolean(r?.a));
  if (!ok) throw new MessageError(403, "Your account can't send messages right now. Contact Findtern support.");
}

/** Open (or reuse) the one thread for this pair from a proposal. `created` is true only for a new row. */
export async function ensureThread(viewer: Viewer, proposalId: string): Promise<{ threadId: string; created: boolean }> {
  const db = getDb();
  const p = schema.proposals;
  const [proposal] = await db
    .select({ id: p.id, employerId: p.employerId, internId: p.internId, status: p.status })
    .from(p)
    .where(eq(p.id, proposalId))
    .limit(1);
  if (!proposal || !isParticipant(proposal, viewer)) throw new MessageError(404, "Not found");
  if (proposal.status === "draft") throw new MessageError(403, NOT_OPEN_YET);
  await assertMayWrite(viewer);

  const t = schema.messageThreads;
  const [row] = await db
    .insert(t)
    .values({ employerId: proposal.employerId, internId: proposal.internId, proposalId: proposal.id })
    .onConflictDoNothing()
    .returning({ id: t.id });
  if (row) return { threadId: row.id, created: true };
  const [existing] = await db.select({ id: t.id }).from(t).where(and(eq(t.employerId, proposal.employerId), eq(t.internId, proposal.internId))).limit(1);
  if (!existing) throw new MessageError(409, "Could not open the conversation. Try again.");
  return { threadId: existing.id, created: false };
}

export async function sendMessage(
  viewer: Viewer,
  threadId: string,
  input: { body: string; clientId: string },
): Promise<{ message: MessageView; created: boolean }> {
  const db = getDb();
  const m = schema.messages;
  const t = schema.messageThreads;
  const thread = await threadFor(viewer, threadId);
  if (!thread) throw new MessageError(404, "Not found");
  if (thread.closedAt) throw new MessageError(409, "This conversation is closed.");
  await assertMayWrite(viewer);

  const view = (r: { id: string; body: string; redacted: boolean; createdAt: Date }): MessageView => ({
    id: r.id,
    mine: true,
    body: r.body,
    redacted: r.redacted,
    createdAt: new Date(r.createdAt).toISOString(),
  });
  const replay = async () => {
    const [r] = await db
      .select({ id: m.id, body: m.body, redacted: m.redacted, createdAt: m.createdAt })
      .from(m)
      .where(and(eq(m.threadId, thread.id), eq(m.senderId, viewer.id), eq(m.clientId, input.clientId)))
      .limit(1);
    return r ?? null;
  };

  // A retry returns the first row and costs no quota.
  const again = await replay();
  if (again) return { message: view(again), created: false };

  if (!perMinute.take(viewer.id) || !perDay.take(viewer.id)) {
    throw new MessageError(429, "You're sending messages too fast. Wait a moment and try again.");
  }

  const { contactUnlocked } = await import("./messages-access.ts");
  const stored = bodyToStore(input.body, await contactUnlocked(thread.employerId, thread.internId));
  const [row] = await db
    .insert(m)
    .values({ threadId: thread.id, senderType: viewer.role, senderId: viewer.id, body: stored.text, clientId: input.clientId, redacted: stored.redacted })
    .onConflictDoNothing()
    .returning({ id: m.id, body: m.body, redacted: m.redacted, createdAt: m.createdAt });
  if (!row) {
    const raced = await replay();
    if (!raced) throw new MessageError(409, "Could not send. Try again.");
    return { message: view(raced), created: false };
  }

  // Sending also means "I have read everything so far".
  await db
    .update(t)
    .set({ lastMessageAt: row.createdAt, ...(viewer.role === "employer" ? { employerLastReadAt: row.createdAt } : { internLastReadAt: row.createdAt }) })
    .where(eq(t.id, thread.id));

  await notifyRecipient(viewer, thread, row.id, stored.text).catch((err) => console.error("[messages] notify failed", err));
  return { message: view(row), created: true };
}

/**
 * In-app alert for the other side, one per unread burst (the dedupe key is the
 * first message they have not read), plus at most one email per burst and only
 * when they are not online. Best effort: a failure never undoes the send.
 */
async function notifyRecipient(viewer: Viewer, thread: ThreadRow, messageId: string, text: string): Promise<void> {
  const db = getDb();
  const m = schema.messages;
  const t = schema.messageThreads;
  const to = other(viewer.role);
  const recipientLastRead = to === "intern" ? thread.internLastReadAt : thread.employerLastReadAt;
  const emailedAt = to === "intern" ? thread.internEmailedAt : thread.employerEmailedAt;

  const [first] = await db
    .select({ id: m.id })
    .from(m)
    .where(
      and(
        eq(m.threadId, thread.id),
        eq(m.senderType, viewer.role),
        recipientLastRead ? gt(m.createdAt, recipientLastRead) : undefined,
      ),
    )
    .orderBy(asc(m.createdAt), asc(m.id))
    .limit(1);
  const firstUnreadId = first?.id ?? messageId;

  let recipientPresence: PresenceLabel | null = null;
  if (to === "intern") {
    const [row] = await db
      .select({ lastSeenAt: schema.userPresence.lastSeenAt, lastActiveAt: schema.userPresence.lastActiveAt })
      .from(schema.userPresence)
      .where(and(eq(schema.userPresence.userType, "intern"), eq(schema.userPresence.userId, thread.internId)))
      .limit(1);
    // The switch hides the label from employers, not the fact that the student is here.
    recipientPresence = presenceLabel(row ? { ...row, hidden: false } : null, new Date());
  }
  // Employers have no presence row; a recent read of this thread means they are in it.
  recipientPresence = effectivePresence(recipientPresence, recipientLastRead);

  const sender = (await counterpartNameFor(to, thread)) ?? "Someone";
  const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  const { notify } = await import("./notify.ts");
  // The alert dedupes per burst; the email is decided separately below, so a burst that
  // began while they were online still mails when they leave without reading.
  await notify({
    to: { type: to, id: to === "intern" ? thread.internId : thread.employerId },
    type: "new_message",
    title: `New message from ${sender}`,
    message: preview,
    data: { threadId: thread.id },
    dedupeKey: `msg:${thread.id}:${firstUnreadId}`,
  });

  if (!emailDue({ recipientPresence, emailedAt, lastReadAt: recipientLastRead })) return;
  // Stamp first, and only if the gap has passed in the database, so two sends racing in one burst mail once.
  const stampCol = to === "intern" ? t.internEmailedAt : t.employerEmailedAt;
  const claimed = await db
    .update(t)
    .set(to === "intern" ? { internEmailedAt: sql`now()` } : { employerEmailedAt: sql`now()` })
    .where(and(eq(t.id, thread.id), or(isNull(stampCol), sql`${stampCol} < now() - ${MIN_EMAIL_GAP_MS / 1000} * interval '1 second'`)))
    .returning({ id: t.id });
  if (claimed.length === 0) return;
  const address = await recipientEmail(to, thread);
  if (!address) return;
  const { sendSmtpMail } = await import("./mailer.ts");
  const mail = renderEmail(
    emails.newMessage({ name: await recipientFirstName(to, thread), from: sender, url: `${origin()}/${to}/messages/${thread.id}` }),
  );
  const res = await sendSmtpMail({ to: address, ...mail }).catch((err) => ({ ok: false as const, error: String(err) }));
  if (!res.ok) {
    console.error("[messages] email failed", res.error);
    // Release the claim so the next message tries again.
    await db
      .update(t)
      .set(to === "intern" ? { internEmailedAt: emailedAt } : { employerEmailedAt: emailedAt })
      .where(eq(t.id, thread.id));
  }
}

async function recipientEmail(recipient: Viewer["role"], thread: ThreadRow): Promise<string | null> {
  const db = getDb();
  if (recipient === "intern") {
    const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, thread.internId)).limit(1);
    return u?.email ?? null;
  }
  const [e] = await db.select({ email: schema.employers.companyEmail }).from(schema.employers).where(eq(schema.employers.id, thread.employerId)).limit(1);
  return e?.email ?? null;
}

/** How the sender is named to this recipient: initials / company mask until the hire is paid. */
async function counterpartNameFor(recipient: Viewer["role"], thread: ThreadRow): Promise<string | null> {
  const viewer: Viewer = { role: recipient, id: recipient === "intern" ? thread.internId : thread.employerId };
  return (await counterpartOf(viewer, thread)).name;
}

async function recipientFirstName(recipient: Viewer["role"], thread: ThreadRow): Promise<string> {
  const db = getDb();
  if (recipient === "intern") {
    const [u] = await db.select({ f: schema.users.firstName }).from(schema.users).where(eq(schema.users.id, thread.internId)).limit(1);
    return (u?.f ?? "").trim();
  }
  const [e] = await db.select({ n: schema.employers.name }).from(schema.employers).where(eq(schema.employers.id, thread.employerId)).limit(1);
  return (e?.n ?? "").split(" ")[0] ?? "";
}

/** Mark the thread read for me, and its message alerts with it. */
export async function markRead(viewer: Viewer, threadId: string): Promise<void> {
  const thread = await threadFor(viewer, threadId);
  if (!thread) throw new MessageError(404, "Not found");
  const db = getDb();
  const t = schema.messageThreads;
  const n = schema.notifications;
  await db
    .update(t)
    .set(viewer.role === "employer" ? { employerLastReadAt: sql`now()` } : { internLastReadAt: sql`now()` })
    .where(eq(t.id, thread.id));
  await db
    .update(n)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(n.recipientType, viewer.role),
        eq(n.recipientId, viewer.id),
        eq(n.type, "new_message"),
        eq(n.isRead, false),
        sql`${n.data}->>'threadId' = ${thread.id}`,
      ),
    );
}
