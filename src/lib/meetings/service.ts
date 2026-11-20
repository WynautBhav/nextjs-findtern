import { randomBytes } from "node:crypto";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { emails, icsInvite } from "@/lib/emails";
import { initialsOf } from "@/lib/employer-candidates";
import { hiredProposalSql } from "@/lib/employer-visibility";
import { formatIst, formatSlotTime } from "@/lib/format";
import { employerNames, internFirstName, notify, resolveInterviewNotifications } from "@/lib/notify";
import { linkTo } from "@/lib/origin";
import { interviewZone, loadProjectZones } from "@/lib/project-zones";
import { wallTimeToUtc } from "@/lib/timezones";

import { getCalendar } from "./calendar.ts";
import { bookedStart, MEETING_MS, step, type Action, type Fields, type Refusal, type Role } from "./slots.ts";

type Db = ReturnType<typeof getDb>;
type Interview = typeof schema.interviews.$inferSelect;

export const INTERN_ZONE = "Asia/Kolkata";

/** The /meet/<token> address of a meeting (Findtern's own page); null when there is no public origin. */
export const gateUrl = (token: string | null | undefined): string | null => (token ? linkTo(`/meet/${token}`) : null);
const newToken = () => randomBytes(18).toString("base64url");

/** The token of a meeting, minting one for a row that has none yet (older meetings). */
export async function ensureGateToken(db: Db, interview: Pick<Interview, "id" | "gateToken">): Promise<string> {
  if (interview.gateToken) return interview.gateToken;
  const token = newToken();
  const [row] = await db
    .update(schema.interviews)
    .set({ gateToken: token })
    .where(and(eq(schema.interviews.id, interview.id), sql`${schema.interviews.gateToken} is null`))
    .returning({ t: schema.interviews.gateToken });
  if (row?.t) return row.t;
  const [cur] = await db.select({ t: schema.interviews.gateToken }).from(schema.interviews).where(eq(schema.interviews.id, interview.id)).limit(1);
  return cur?.t ?? token;
}

export type Fail = { ok: false; status: number; error: string; code?: string };
const fail = (status: number, error: string, code?: string): Fail => ({ ok: false, status, error, code });
const refused = (r: Refusal): Fail => fail(r.code === "not_found" ? 404 : r.code === "own_offer" ? 403 : ["no_slots", "too_many_slots", "bad_slot", "not_quarter_hour", "slot_past", "slot_far", "slot_duplicate", "reason_required", "slot_not_offered"].includes(r.code) ? 400 : 409, r.error, r.code);

/** Wall-clock "YYYY-MM-DDTHH:MM" strings in `zone` to UTC instants; null when a zone or string is unusable. */
export function wallsToUtc(walls: string[], zone: string): Date[] | null {
  try {
    return walls.map((w) => wallTimeToUtc(w, zone));
  } catch {
    return null;
  }
}

/** Start times of the other confirmed meetings of either party (the conflict check's input). */
export async function busyStarts(db: Pick<Db, "select">, employerId: string, internId: string, exceptId: string | null): Promise<number[]> {
  const rows = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.status, "scheduled"), isNotNull(schema.interviews.selectedSlot), sql`(${schema.interviews.employerId} = ${employerId} or ${schema.interviews.internId} = ${internId})`));
  const out: number[] = [];
  for (const r of rows) {
    if (r.id === exceptId) continue;
    const s = bookedStart(r);
    if (s !== null && s > Date.now() - 2 * MEETING_MS) out.push(s);
  }
  return out;
}

/** Whether `internId` and `employerId` already have a relationship (shortlist, proposal or interview) an intern may start a meeting inside. */
export async function hasRelationship(db: Db, employerId: string, internId: string, projectId?: string | null): Promise<boolean> {
  const proj = (col: unknown) => (projectId ? sql`and ${col} = ${projectId}` : sql``);
  const q = await db.execute(sql`
    select 1 as ok from employer_cart_items where employer_id = ${employerId} and intern_id = ${internId} ${proj(sql`project_id`)}
    union all select 1 from proposals where employer_id = ${employerId} and intern_id = ${internId} ${proj(sql`project_id`)}
    union all select 1 from interviews where employer_id = ${employerId} and intern_id = ${internId} ${proj(sql`project_id`)}
    limit 1`);
  return q.rows.length > 0;
}

/** Locks both parties for the length of a transaction, so two picks for the same person cannot both pass the conflict check. */
async function withPartyLocks<T>(db: Db, employerId: string, internId: string, fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  const keys = [`meet:${employerId}`, `meet:${internId}`].sort();
  return db.transaction(async (tx) => {
    for (const k of keys) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${k}))`);
    return fn(tx);
  });
}

export type Names = { employer: string; employerContact: string; intern: string; internFirst: string; internSeesCompany: boolean };

/** What each side may call the other: the intern sees the company only after a hire, the employer sees initials. */
export async function namesFor(db: Db, iv: Pick<Interview, "employerId" | "internId">): Promise<Names> {
  const [[user], en, [hire]] = await Promise.all([
    db.select({ f: schema.users.firstName, l: schema.users.lastName }).from(schema.users).where(eq(schema.users.id, iv.internId)).limit(1),
    employerNames(iv.employerId),
    db
      .select({ id: schema.proposals.id })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, iv.employerId), eq(schema.proposals.internId, iv.internId), hiredProposalSql()))
      .limit(1),
  ]);
  return {
    employer: hire ? en.company : "A company on Findtern",
    employerContact: en.contact,
    intern: `Candidate ${initialsOf(user?.f ?? "", user?.l ?? "")}`,
    internFirst: (user?.f ?? "").trim(),
    internSeesCompany: Boolean(hire),
  };
}

const rowFields = (f: Fields) => ({
  status: f.status,
  proposedBy: f.proposedBy,
  round: f.round,
  respondBy: f.respondBy,
  slot1: f.slot1,
  slot2: f.slot2,
  slot3: f.slot3,
  selectedSlot: f.selectedSlot,
  cancelledBy: f.cancelledBy,
  cancelReason: f.cancelReason,
  updatedAt: new Date(),
});

const zoneFor = async (db: Db, iv: Interview, role: Role) => (role === "intern" ? INTERN_ZONE : interviewZone(iv, await loadProjectZones(db, [iv.projectId])));

/** Wall-clock slots as the acting side typed them (employer: the project's zone, intern: IST). */
export async function actorSlots(db: Db, iv: Interview, role: Role, walls: string[]): Promise<Date[] | Fail> {
  const slots = wallsToUtc(walls, await zoneFor(db, iv, role));
  return slots ?? fail(400, "Unknown time or timezone.");
}

export type ActionInput =
  | { type: "choose"; slot: number }
  | { type: "counter"; slots: Date[] }
  | { type: "reschedule"; slots: Date[] }
  | { type: "cancel"; reason: string };

/**
 * One state change on a meeting by `role`: checks the rules (slots.ts), writes it with a status-guarded UPDATE (a stale
 * or double click is a 409), books or withdraws the calendar event and tells the other side. The raw Meet URL never
 * leaves the database: mail and invites carry /meet/<token>.
 */
export async function act(interviewId: string, role: Role, uid: string, input: ActionInput): Promise<{ ok: true; interview: Interview } | Fail> {
  const db = getDb();
  const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, interviewId)).limit(1);
  if (!iv) return fail(404, "Not found");
  if ((role === "employer" ? iv.employerId : iv.internId) !== uid) return fail(403, "Forbidden");

  const prev = { status: iv.status, round: iv.round, proposedBy: iv.proposedBy };
  const written = await withPartyLocks(db, iv.employerId, iv.internId, async (tx) => {
    const [cur] = await tx.select().from(schema.interviews).where(eq(schema.interviews.id, interviewId)).limit(1);
    if (!cur) return fail(404, "Not found");
    const action: Action =
      input.type === "choose"
        ? { type: "choose", by: role, slot: input.slot, busy: await busyStarts(tx, cur.employerId, cur.internId, cur.id) }
        : input.type === "cancel"
          ? { type: "cancel", by: role, reason: input.reason }
          : { type: input.type, by: role, slots: input.slots };
    const r = step(cur, action);
    if (!r.ok) return refused(r);
    const f = r.fields;
    const [row] = await tx
      .update(schema.interviews)
      .set({
        ...rowFields(f),
        ...(f.status === "scheduled" ? { gateToken: cur.gateToken ?? newToken() } : {}),
        ...(f.status === "pending" || f.status === "cancelled" ? { meetingLink: null, calendarEventId: null, employerJoinedAt: null } : {}),
      })
      .where(and(eq(schema.interviews.id, interviewId), eq(schema.interviews.status, cur.status), eq(schema.interviews.round, cur.round), eq(schema.interviews.proposedBy, cur.proposedBy)))
      .returning();
    if (!row) return fail(409, "This meeting changed. Refresh and try again.", "stale");
    return { ok: true as const, row, before: cur };
  });
  if (!("row" in written)) return written;
  const { row, before } = written;
  void prev;

  // After the commit: calendar, then mail. A Google or mail failure never undoes the saved change.
  const cal = await getCalendar();
  if (before.calendarEventId && (row.status === "pending" || row.status === "cancelled")) {
    await cal.deleteEvent(before.calendarEventId).catch((e) => console.error("[meetings] calendar delete failed", e));
  }
  let final = row;
  if (row.status === "scheduled") final = await bookCalendar(db, row);
  await resolveInterviewNotifications(row.internId, row.id).catch(() => undefined);
  await tellOtherSide(db, role, before, final, input).catch((e) => console.error("[meetings] notify failed", e));
  return { ok: true, interview: final };
}

/** Makes the Meet event for a booked meeting; with no calendar connected (or Google down) the meeting stays booked, link pending. */
async function bookCalendar(db: Db, iv: Interview): Promise<Interview> {
  const start = bookedStart(iv);
  if (start === null) return iv;
  try {
    const tz = interviewZone(iv, await loadProjectZones(db, [iv.projectId]));
    const ev = await (await getCalendar()).createEvent({
      title: `Findtern meeting ${iv.id.slice(0, 8)}`,
      description: "Findtern meeting. Each side joins from Findtern; nobody is invited by email.",
      start: new Date(start),
      end: new Date(start + MEETING_MS),
      timezone: tz,
    });
    if (!ev) return iv;
    const [upd] = await db
      .update(schema.interviews)
      .set({ meetingLink: ev.meetUrl, calendarEventId: ev.eventId, updatedAt: new Date() })
      .where(and(eq(schema.interviews.id, iv.id), eq(schema.interviews.status, "scheduled"), eq(schema.interviews.round, iv.round)))
      .returning();
    if (!upd) await (await getCalendar()).deleteEvent(ev.eventId).catch(() => undefined);
    return upd ?? iv;
  } catch (e) {
    console.error("[meetings] Meet creation failed; meeting is booked with the link pending", e);
    return iv;
  }
}

const listTimes = (iv: Interview, zone: string) =>
  [iv.slot1, iv.slot2, iv.slot3].filter((d): d is Date => Boolean(d)).map((d) => (zone === INTERN_ZONE ? formatIst(d, { year: true }) : formatSlotTime(d, zone)));

async function tellOtherSide(db: Db, role: Role, before: Interview, iv: Interview, input: ActionInput): Promise<void> {
  const names = await namesFor(db, iv);
  const empZone = interviewZone(iv, await loadProjectZones(db, [iv.projectId]));
  const [project] = iv.projectId ? await db.select({ n: schema.projects.projectName }).from(schema.projects).where(eq(schema.projects.id, iv.projectId)).limit(1) : [];
  const other: Role = role === "employer" ? "intern" : "employer";
  const to = other === "intern" ? { type: "intern" as const, id: iv.internId } : { type: "employer" as const, id: iv.employerId };
  const toName = other === "intern" ? names.internFirst : names.employerContact;
  const fromLabel = role === "employer" ? names.employer : names.intern;
  const zoneOf = (r: Role) => (r === "intern" ? INTERN_ZONE : empZone);
  const zoneLabel = (r: Role) => (r === "intern" ? "IST" : empZone);

  if (input.type === "counter" || input.type === "reschedule") {
    const counter = input.type === "counter";
    await notify({
      to,
      type: counter ? "meeting_countered" : "meeting_proposed",
      title: counter ? "New times proposed" : "Meeting times proposed",
      message: counter ? `${fromLabel} proposed other times. Pick one that works.` : `${fromLabel} offered new times. Pick one that works.`,
      data: { interviewId: iv.id, link: other === "intern" ? "/intern/interviews" : "/employer/schedule" },
      dedupeKey: `meeting_offer:${iv.id}:${iv.round}:${iv.updatedAt?.getTime() ?? 0}`,
      email: emails.meetingProposed({ name: toName, other: fromLabel, times: listTimes(iv, zoneOf(other)), zone: zoneLabel(other), forEmployer: other === "employer", counter, project: project?.n ?? null }),
    });
    // A booked meeting that moved: withdraw the calendar file the other side already had.
    const was = bookedStart(before);
    if (before.status === "scheduled" && was !== null) await sendCancelFile(iv, before, was);
    return;
  }

  if (input.type === "cancel") {
    const when = bookedStart(before);
    const whenFor = (r: Role) => (when === null ? null : r === "intern" ? formatIst(new Date(when), { year: true }) : formatSlotTime(new Date(when), empZone));
    await notify({
      to,
      type: "meeting_cancelled",
      title: "Meeting cancelled",
      message: `${fromLabel} cancelled the meeting: ${iv.cancelReason}`,
      data: { interviewId: iv.id, link: other === "intern" ? "/intern/interviews" : "/employer/schedule" },
      dedupeKey: `meeting_cancelled:${iv.id}`,
      email: emails.meetingCancelled({ name: toName, other: fromLabel, when: whenFor(other), reason: iv.cancelReason ?? "", byWho: fromLabel, forEmployer: other === "employer" }),
    });
    if (when !== null) await sendCancelFile(iv, before, when);
    return;
  }

  // choose: both sides get a confirmation with their own .ics and the gate link.
  const start = bookedStart(iv);
  if (start === null) return;
  const url = gateUrl(iv.gateToken);
  const end = new Date(start + MEETING_MS);
  const sequence = Math.floor(Date.now() / 1000);
  const mk = (r: Role) =>
    icsInvite({
      uid: `${iv.id}-${r}`,
      start: new Date(start),
      end,
      title: r === "intern" ? `Meeting with ${names.employer}` : `Meeting with ${names.intern}`,
      description: url ? `Join from Findtern: ${url}` : "Findtern will email the meeting link.",
      url,
      sequence,
    });
  const when = (r: Role) => (r === "intern" ? formatIst(new Date(start), { year: true }) : formatSlotTime(new Date(start), empZone));
  await Promise.all(
    (["intern", "employer"] as const).map((r) =>
      notify({
        to: r === "intern" ? { type: "intern", id: iv.internId } : { type: "employer", id: iv.employerId },
        type: "meeting_scheduled",
        title: "Meeting confirmed",
        message: `Your meeting is on ${when(r)}${iv.meetingLink ? "" : ". The link will follow."}`,
        data: { interviewId: iv.id, link: r === "intern" ? "/intern/interviews" : "/employer/schedule" },
        dedupeKey: `meeting_confirmed:${iv.id}:${r}:${start}`,
        email: emails.meetingConfirmed({ name: r === "intern" ? names.internFirst : names.employerContact, other: r === "intern" ? names.employer : names.intern, when: when(r), gateUrl: iv.meetingLink ? url : null, forEmployer: r === "employer" }),
        attachments: [mk(r)],
      }),
    ),
  );
}

/** Withdraws the per-side calendar files of a booked meeting that was cancelled or moved. */
async function sendCancelFile(iv: Interview, before: Interview, start: number): Promise<void> {
  const sequence = Math.floor(Date.now() / 1000);
  for (const r of ["intern", "employer"] as const) {
    await notify({
      to: r === "intern" ? { type: "intern", id: iv.internId } : { type: "employer", id: iv.employerId },
      type: "meeting_calendar_update",
      title: "Calendar entry withdrawn",
      message: "The earlier meeting time was withdrawn.",
      data: { interviewId: iv.id },
      dedupeKey: `meeting_cancel_file:${iv.id}:${r}:${start}:${iv.round}:${iv.status}`,
      attachments: [icsInvite({ uid: `${before.id}-${r}`, start: new Date(start), end: new Date(start + MEETING_MS), title: "Findtern meeting (cancelled)", description: "This time was withdrawn.", cancel: true, sequence })],
      email: undefined,
    });
  }
}

export type CreateInput = { by: Role; employerId: string; internId: string; projectId: string | null; slots: Date[]; timezone: string };

/** A new meeting offer (employer: from a Book meeting button; intern: only inside an existing relationship, checked by the caller). */
export async function createMeeting(db: Db, i: CreateInput): Promise<{ ok: true; interview: Interview } | Fail> {
  const r = step(undefined, { type: "propose", by: i.by, slots: i.slots });
  if (!r.ok) return refused(r);
  const { isBlockingInterview } = await import("@/lib/employer-interview-rules");
  const created = await withPartyLocks(db, i.employerId, i.internId, async (tx) => {
    const open = await tx
      .select()
      .from(schema.interviews)
      .where(and(eq(schema.interviews.employerId, i.employerId), eq(schema.interviews.internId, i.internId), inArray(schema.interviews.status, ["pending", "scheduled"])));
    if (open.some((iv) => isBlockingInterview(iv))) return null;
    const [row] = await tx
      .insert(schema.interviews)
      .values({ employerId: i.employerId, internId: i.internId, projectId: i.projectId ?? undefined, timezone: i.timezone, ...rowFields(r.fields), gateToken: newToken() })
      .returning();
    return row;
  });
  if (!created) return fail(409, "A meeting with this candidate is already open - finish it first.", "open_meeting");
  return { ok: true, interview: created };
}

/** The mail and notice for a new offer (employer's first offer keeps its existing invitation email). */
export async function announceOffer(db: Db, iv: Interview, by: Role): Promise<void> {
  const names = await namesFor(db, iv);
  const empZone = interviewZone(iv, await loadProjectZones(db, [iv.projectId]));
  const [project] = iv.projectId ? await db.select({ n: schema.projects.projectName }).from(schema.projects).where(eq(schema.projects.id, iv.projectId)).limit(1) : [];
  const toIntern = by === "employer";
  await notify({
    to: toIntern ? { type: "intern", id: iv.internId } : { type: "employer", id: iv.employerId },
    type: toIntern ? "interview_pending" : "meeting_requested",
    title: toIntern ? "Interview invitation" : "Candidate proposed a meeting",
    message: toIntern ? "A company invited you to an interview. Pick a slot that works for you." : `${names.intern} proposed times to meet. Pick one that works.`,
    data: { interviewId: iv.id, link: toIntern ? "/intern/interviews" : "/employer/schedule" },
    email: emails.meetingProposed({
      name: toIntern ? names.internFirst || (await internFirstName(iv.internId)) : names.employerContact,
      other: toIntern ? names.employer : names.intern,
      times: listTimes(iv, toIntern ? INTERN_ZONE : empZone),
      zone: toIntern ? "IST" : empZone,
      forEmployer: !toIntern,
      project: project?.n ?? null,
    }),
  });
}
