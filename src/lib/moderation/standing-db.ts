import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";
import { notifyCounterpartiesOfHold } from "./hold-offers";
import { acknowledgeWarning, applyAccountAction, type AcknowledgeDeps, type StandingDeps, type StandingInput, type StandingTx } from "./standing-service";
import { standingOf, type StrikeEntry, type StrikeSubject } from "./strikes";

/** The database side of the standing service: real deps for applyAccountAction / acknowledgeWarning, and the reads the admin pages and the notice gate use. */

type Subject = { type: StrikeSubject; id: string };

export type StrikeRow = {
  id: string;
  kind: string;
  reason: string;
  evidenceNote: string | null;
  adminId: string | null;
  adminName: string | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
};

export async function loadStrikeHistory(subject: Subject): Promise<StrikeRow[]> {
  const rows = await getDb()
    .select({
      id: schema.accountStrikes.id,
      kind: schema.accountStrikes.kind,
      reason: schema.accountStrikes.reason,
      evidenceNote: schema.accountStrikes.evidenceNote,
      adminId: schema.accountStrikes.adminId,
      acknowledgedAt: schema.accountStrikes.acknowledgedAt,
      createdAt: schema.accountStrikes.createdAt,
    })
    .from(schema.accountStrikes)
    .where(and(eq(schema.accountStrikes.userType, subject.type), eq(schema.accountStrikes.userId, subject.id)))
    .orderBy(asc(schema.accountStrikes.createdAt));
  const adminIds = [...new Set(rows.map((r) => r.adminId).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (adminIds.length > 0) {
    const admins = await getDb().select({ id: schema.admins.id, name: schema.admins.name, email: schema.admins.email }).from(schema.admins).where(inArray(schema.admins.id, adminIds));
    for (const a of admins) names.set(a.id, a.name?.trim() || a.email);
  }
  return rows.map((r) => ({ ...r, adminName: r.adminId ? (names.get(r.adminId) ?? null) : null }));
}

/** Standing for the admin panel: history (evidence included: admin pages only) and the current freeze. */
export async function loadStanding(subject: Subject) {
  const db = getDb();
  const history = await loadStrikeHistory(subject);
  const table = subject.type === "intern" ? schema.users : schema.employers;
  const [row] = await db.select({ frozenAt: table.frozenAt, frozenReason: table.frozenReason }).from(table).where(eq(table.id, subject.id)).limit(1);
  const frozen = Boolean(row?.frozenAt);
  return { history, frozenAt: row?.frozenAt ?? null, frozenReason: row?.frozenReason ?? null, standing: standingOf(history as StrikeEntry[], frozen) };
}

/** The person's own unacknowledged warning, if any. No evidence, no admin: only what the notice needs. */
export async function pendingWarningFor(subject: Subject): Promise<{ id: string; reason: string; createdAt: Date } | null> {
  const [row] = await getDb()
    .select({ id: schema.accountStrikes.id, reason: schema.accountStrikes.reason, createdAt: schema.accountStrikes.createdAt })
    .from(schema.accountStrikes)
    .where(and(eq(schema.accountStrikes.userType, subject.type), eq(schema.accountStrikes.userId, subject.id), eq(schema.accountStrikes.kind, "warning"), isNull(schema.accountStrikes.acknowledgedAt)))
    .orderBy(asc(schema.accountStrikes.createdAt))
    .limit(1);
  return row ?? null;
}

export const standingDeps: StandingDeps = {
  now: () => new Date(),
  async transaction(subject, fn) {
    return getDb().transaction(async (tx) => {
      const table = subject.type === "intern" ? schema.users : schema.employers;
      const [row] = await tx.select().from(table).where(eq(table.id, subject.id)).for("update").limit(1);
      if (!row) return null;
      const name = subject.type === "intern" ? String((row as { firstName?: string | null }).firstName ?? "").trim() : String((row as { name?: string | null }).name ?? "").split(" ")[0] ?? "";
      const history = await tx
        .select({ id: schema.accountStrikes.id, kind: schema.accountStrikes.kind, acknowledgedAt: schema.accountStrikes.acknowledgedAt, createdAt: schema.accountStrikes.createdAt })
        .from(schema.accountStrikes)
        .where(and(eq(schema.accountStrikes.userType, subject.type), eq(schema.accountStrikes.userId, subject.id)))
        .orderBy(asc(schema.accountStrikes.createdAt));
      const adminId = { current: "" };
      const t: StandingTx = {
        state: { name, frozen: Boolean(row.frozenAt), history },
        async insertStrike(r) {
          adminId.current = r.adminId;
          const [ins] = await tx
            .insert(schema.accountStrikes)
            .values({ userType: subject.type, userId: subject.id, kind: r.kind, reason: r.reason, evidenceNote: r.evidenceNote, adminId: r.adminId })
            .returning({ id: schema.accountStrikes.id });
          return ins.id;
        },
        async setFrozen(frozenAt, reason) {
          await tx.update(table).set({ frozenAt, frozenReason: reason }).where(eq(table.id, subject.id));
        },
        async audit(entry) {
          await recordAdminAudit(tx, { adminId: adminId.current, action: entry.action, targetType: subject.type === "intern" ? "user" : "employer", targetId: subject.id, meta: entry.meta }, { strict: true });
        },
      };
      return fn(t);
    });
  },
  async notify(to, n, dedupeKey, data) {
    await notify({ to, type: n.type, title: n.title, message: n.message, data, dedupeKey, email: n.email });
  },
  async afterHoldChange(subject, change, strikeId) {
    await notifyCounterpartiesOfHold(subject, change, strikeId);
  },
};

export function runAccountAction(input: StandingInput) {
  return applyAccountAction(standingDeps, input);
}

export const acknowledgeDeps: AcknowledgeDeps = {
  now: () => new Date(),
  async acknowledge(subject, _ids, at) {
    const done = await getDb()
      .update(schema.accountStrikes)
      .set({ acknowledgedAt: at })
      .where(and(eq(schema.accountStrikes.userType, subject.type), eq(schema.accountStrikes.userId, subject.id), eq(schema.accountStrikes.kind, "warning"), isNull(schema.accountStrikes.acknowledgedAt)))
      .returning({ id: schema.accountStrikes.id });
    return done.length;
  },
};

export function runAcknowledge(subject: Subject) {
  return acknowledgeWarning(acknowledgeDeps, subject);
}


