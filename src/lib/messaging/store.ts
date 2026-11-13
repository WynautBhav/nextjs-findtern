import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { denyTermsFor, scrubOutgoing } from "@/lib/contact-scrub";
import { displayNameOf, initialsOf } from "@/lib/employer-candidates";
import { isHiredProposal } from "@/lib/hire-status";
import { RateLimiter } from "@/lib/security/rate-limit";
import { presenceView, threadPresence } from "../presence-logic";
import { ONLINE_WINDOW_MS, canSend, otherParticipant } from "./logic";

/** Per-user, in memory (same limitation as the other limiters). */
export const messageLimiter = new RateLimiter(30, 60_000);
export const heartbeatLimiter = new RateLimiter(6, 60_000);
export const threadLimiter = new RateLimiter(20, 60_000);

export async function getThread(id: string) {
  const [t] = await getDb().select().from(schema.threads).where(eq(schema.threads.id, id)).limit(1);
  return t ?? null;
}

export async function pushEvent(userId: string, type: string, payload: Record<string, unknown>) {
  await getDb().insert(schema.realtimeEvents).values({ userId, type, payload });
}

type ThreadRecord = typeof schema.threads.$inferSelect;

export type ThreadContext = {
  /** Any proposal between the pair is hired (paid). Until then contact details and names stay out of chat. */
  hired: boolean;
  proposalStatus: string | null;
  projectName: string | null;
  employerHasMessaged: boolean;
  /** Names that may not cross while `hired` is false. */
  denyTerms: string[];
  companyName: string;
  internFullName: string;
  internInitials: string;
};

/** Everything the send rules, the scrub and the titles need for a set of threads, in a fixed number of queries. */
export async function loadThreadContexts(threads: ThreadRecord[]): Promise<Map<string, ThreadContext>> {
  const out = new Map<string, ThreadContext>();
  if (!threads.length) return out;
  const db = getDb();
  const employerIds = [...new Set(threads.map((t) => t.employerId))];
  const internIds = [...new Set(threads.map((t) => t.internId))];
  const threadIds = threads.map((t) => t.id);
  const [props, emps, ints, firsts] = await Promise.all([
    db
      .select({
        id: schema.proposals.id,
        employerId: schema.proposals.employerId,
        internId: schema.proposals.internId,
        status: schema.proposals.status,
        hiredAt: schema.proposals.hiredAt,
        projectName: schema.projects.projectName,
      })
      .from(schema.proposals)
      .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .where(and(inArray(schema.proposals.employerId, employerIds), inArray(schema.proposals.internId, internIds))),
    db
      .select({
        id: schema.employers.id,
        name: schema.employers.name,
        companyName: schema.employers.companyName,
        primaryContactName: schema.employers.primaryContactName,
        escalationContactName: schema.employers.escalationContactName,
      })
      .from(schema.employers)
      .where(inArray(schema.employers.id, employerIds)),
    db
      .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(schema.users)
      .where(inArray(schema.users.id, internIds)),
    db
      .selectDistinct({ threadId: schema.messages.threadId })
      .from(schema.messages)
      .innerJoin(schema.threads, eq(schema.threads.id, schema.messages.threadId))
      .where(and(inArray(schema.messages.threadId, threadIds), eq(schema.messages.senderId, schema.threads.employerId))),
  ]);
  const empBy = new Map(emps.map((e) => [e.id, e]));
  const internBy = new Map(ints.map((u) => [u.id, u]));
  const employerSpoke = new Set(firsts.map((f) => f.threadId));
  for (const t of threads) {
    const mine = props.filter((p) => p.employerId === t.employerId && p.internId === t.internId);
    const own = t.proposalId ? mine.find((p) => p.id === t.proposalId) : undefined;
    const e = empBy.get(t.employerId);
    const u = internBy.get(t.internId);
    out.set(t.id, {
      hired: mine.some((p) => isHiredProposal(p)),
      proposalStatus: own?.status ?? null,
      projectName: own?.projectName ?? null,
      employerHasMessaged: employerSpoke.has(t.id),
      denyTerms: denyTermsFor({
        company: e?.companyName,
        employerNames: [e?.name, e?.primaryContactName, e?.escalationContactName],
        internFirst: u?.firstName,
        internLast: u?.lastName,
      }),
      companyName: e?.companyName ?? "",
      internFullName: `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim(),
      internInitials: initialsOf(u?.firstName ?? "", u?.lastName ?? ""),
    });
  }
  return out;
}

/** Read side: before the hire is paid, stored text is passed through the same scrub as a send (covers messages saved before the rule). */
export function visibleBody(body: string, ctx: ThreadContext | undefined): string {
  if (!ctx || ctx.hired) return body;
  return scrubOutgoing(body, ctx.denyTerms).text;
}

/**
 * The caller's threads. Counterpart is an id plus a presence label only: no email, no phone, no timestamp. A
 * counterpart who hid their activity (user_presence.show_activity) gets a null label and `online: false`; the
 * database never returns their last_seen_at (CASE below), so nothing downstream can leak it.
 */
export async function listThreads(uid: string, role: "employer" | "intern") {
  const db = getDb();
  const mine = role === "employer" ? schema.threads.employerId : schema.threads.internId;
  const rows = await db.select().from(schema.threads).where(eq(mine, uid)).orderBy(desc(schema.threads.lastMessageAt)).limit(200);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const unread = await db
    .select({ threadId: schema.messages.threadId, n: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(and(inArray(schema.messages.threadId, ids), ne(schema.messages.senderId, uid), isNull(schema.messages.readAt)))
    .groupBy(schema.messages.threadId);
  const unreadBy = new Map(unread.map((u) => [u.threadId, u.n]));
  const last = await db
    .selectDistinctOn([schema.messages.threadId], { threadId: schema.messages.threadId, body: schema.messages.body, senderId: schema.messages.senderId, createdAt: schema.messages.createdAt })
    .from(schema.messages)
    .where(inArray(schema.messages.threadId, ids))
    .orderBy(schema.messages.threadId, desc(schema.messages.createdAt));
  const lastBy = new Map(last.map((l) => [l.threadId, l]));
  const ctxs = await loadThreadContexts(rows);
  const others = rows.map((r) => otherParticipant(r, uid)!);
  const up = schema.userPresence;
  // Employer viewer: the candidate's timestamp, unless hidden. Candidate viewer: the employer's timestamp is only
  // ever returned while it is inside the online window, so a stale last-seen never leaves Postgres for a student.
  // (localtimestamp: the heartbeat stores now() into this timestamp-without-zone column the same way.)
  const seen =
    role === "employer"
      ? sql<Date | null>`CASE WHEN ${up.showActivity} THEN ${up.lastSeenAt} ELSE NULL END`
      : sql<Date | null>`CASE WHEN ${up.showActivity} AND ${up.lastSeenAt} > localtimestamp - make_interval(secs => ${ONLINE_WINDOW_MS / 1000}) THEN ${up.lastSeenAt} ELSE NULL END`;
  const pres = await db
    .select({
      userId: up.userId,
      showActivity: up.showActivity,
      lastSeenAt: seen.mapWith(up.lastSeenAt),
    })
    .from(up)
    .where(inArray(up.userId, others));
  const now = Date.now();
  const presBy = new Map(pres.map((p) => [p.userId, presenceView(p, now)]));
  return rows.map((r) => {
    const other = otherParticipant(r, uid)!;
    const l = lastBy.get(r.id);
    const pr = threadPresence(role, presBy.get(other), now);
    const c = ctxs.get(r.id);
    const block = c ? canSend({ role, employerHasMessaged: c.employerHasMessaged, proposalStatus: c.proposalStatus }) : { ok: true as const };
    // Row 25. Employer: initials, full name after hire. Intern: the company name only after hire.
    const counterpartName = !c
      ? null
      : role === "employer"
        ? displayNameOf({ fullName: c.internFullName, initials: c.internInitials }, c.hired)
        : c.hired
          ? c.companyName || null
          : null;
    return {
      id: r.id,
      proposalId: r.proposalId,
      counterpartId: other,
      counterpartOnline: pr.online,
      counterpartPresence: pr.label,
      counterpartName,
      projectName: c?.projectName ?? null,
      sendBlock: block.ok ? null : block.reason,
      lastMessage: l ? { body: visibleBody(l.body, c), mine: l.senderId === uid, createdAt: l.createdAt } : null,
      lastMessageAt: r.lastMessageAt,
      unread: unreadBy.get(r.id) ?? 0,
    };
  });
}
