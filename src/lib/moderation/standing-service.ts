import type { EmailContent } from "../emails.ts";
import { standingEmails, standingNotices } from "../emails/standing.ts";
import {
  cleanEvidence,
  isStrikeReason,
  isUnfreezeReason,
  pendingWarningIds,
  planAction,
  standingOf,
  violationCount,
  type AdminAction,
  type Standing,
  type StrikeEntry,
  type StrikeReason,
  type StrikeSubject,
} from "./strikes.ts";

/**
 * The orchestration of one admin click on an account's standing, with every side effect behind `deps` so it runs under plain
 * `node --test` with fakes (a fake mailer included). The real deps are in standing-db.ts.
 *
 * Order, and why: the subject row is locked and read, the plan is made from the history just read (so two clicks serialise),
 * the strike row, the freeze columns and the audit row are written in ONE transaction, and only after COMMIT are the person and
 * the other sides told (a failed email never undoes the action, and notices are deduped per strike so a retry never doubles them).
 * Only an admin action reaches this function: nothing else in the app creates a strike.
 */

export type StandingInput = {
  subject: { type: StrikeSubject; id: string };
  adminId: string;
  action: AdminAction;
  reason: unknown;
  evidenceNote: unknown;
  expectedViolations: unknown;
};

export type StandingTxState = { name: string; frozen: boolean; history: StrikeEntry[] };

export type StandingTx = {
  state: StandingTxState;
  insertStrike(row: { kind: "warning" | "freeze" | "unfreeze"; reason: string; evidenceNote: string; adminId: string }): Promise<string>;
  setFrozen(frozenAt: Date | null, reason: string | null): Promise<void>;
  audit(entry: { action: "account.warn" | "account.freeze" | "account.unfreeze"; meta: Record<string, unknown> }): Promise<void>;
};

export type Notice = { title: string; message: string; email: EmailContent; type: string };

export type StandingDeps = {
  /** Locks the subject row (FOR UPDATE), loads its state and runs `fn` in one transaction. Null when the account does not exist. */
  transaction<T>(subject: { type: StrikeSubject; id: string }, fn: (tx: StandingTx) => Promise<T>): Promise<T | null>;
  /** In-app notification + email, deduped by `dedupeKey`. Best effort. */
  notify(to: { type: StrikeSubject; id: string }, n: Notice, dedupeKey: string, data: Record<string, unknown>): Promise<void>;
  /** After a freeze or an unfreeze: tell the other sides of the open offers and proposals, neutrally (decision D3). */
  afterHoldChange(subject: { type: StrikeSubject; id: string }, change: "held" | "released", strikeId: string): Promise<void>;
  now(): Date;
};

export type StandingResult =
  | { ok: true; effect: "warn" | "freeze" | "unfreeze"; standing: Standing; strikeId: string }
  | { ok: true; effect: "none"; why: "stale" | "already_frozen" | "not_frozen"; standing: Standing }
  | { ok: false; status: 400 | 404; error: string };

const ACTIONS: readonly AdminAction[] = ["violation", "freeze", "unfreeze"];

export async function applyAccountAction(deps: StandingDeps, input: StandingInput): Promise<StandingResult> {
  if (!ACTIONS.includes(input.action)) return { ok: false, status: 400, error: "Unknown action." };
  const unfreezing = input.action === "unfreeze";
  if (unfreezing ? !isUnfreezeReason(input.reason) : !isStrikeReason(input.reason)) return { ok: false, status: 400, error: "Pick a reason." };
  const reason = input.reason as string;
  const evidence = cleanEvidence(input.evidenceNote);
  if (!evidence.ok) return { ok: false, status: 400, error: evidence.error };
  const expected = typeof input.expectedViolations === "number" && Number.isInteger(input.expectedViolations) ? input.expectedViolations : unfreezing ? 0 : null;
  if (expected === null) return { ok: false, status: 400, error: "Reload the page and try again." };

  const now = deps.now();
  const done = await deps.transaction(input.subject, async (tx) => {
    const plan = planAction({ violations: violationCount(tx.state.history), frozen: tx.state.frozen }, { action: input.action, expectedViolations: expected });
    if (plan.effect === "none") return { plan, standing: standingOf(tx.state.history, tx.state.frozen), name: tx.state.name, strikeId: null as string | null };
    const kind = plan.effect === "warn" ? "warning" : plan.effect === "freeze" ? "freeze" : "unfreeze";
    const strikeId = await tx.insertStrike({ kind, reason, evidenceNote: evidence.note, adminId: input.adminId });
    if (plan.effect === "freeze") await tx.setFrozen(now, reason);
    if (plan.effect === "unfreeze") await tx.setFrozen(null, null);
    const history: StrikeEntry[] = [...tx.state.history, { id: strikeId, kind, createdAt: now }];
    const frozen = plan.effect === "freeze" ? true : plan.effect === "unfreeze" ? false : tx.state.frozen;
    await tx.audit({
      action: plan.effect === "warn" ? "account.warn" : plan.effect === "freeze" ? "account.freeze" : "account.unfreeze",
      meta: { userType: input.subject.type, userId: input.subject.id, strikeId, reason, hasEvidenceNote: true, violationsAfter: standingOf(history, frozen).violations },
    });
    return { plan, standing: standingOf(history, frozen), name: tx.state.name, strikeId };
  });
  if (!done) return { ok: false, status: 404, error: "Account not found." };

  if (done.plan.effect === "none") return { ok: true, effect: "none", why: done.plan.why, standing: done.standing };

  const effect = done.plan.effect;
  const strikeId = done.strikeId as string;
  const who = { name: done.name, role: input.subject.type };
  try {
    if (effect === "warn") {
      const n = standingNotices.warning;
      await deps.notify(input.subject, { ...n, type: "account_warning", email: standingEmails.accountWarning({ ...who, reason: reason as StrikeReason }) }, `account_warning:${strikeId}`, { strikeId });
    } else if (effect === "freeze") {
      const n = standingNotices.frozen;
      await deps.notify(input.subject, { ...n, type: "account_frozen", email: standingEmails.accountFrozen({ ...who, reason: reason as StrikeReason }) }, `account_frozen:${strikeId}`, { strikeId });
      await deps.afterHoldChange(input.subject, "held", strikeId);
    } else {
      const n = standingNotices.unfrozen;
      await deps.notify(input.subject, { ...n, type: "account_unfrozen", email: standingEmails.accountUnfrozen(who) }, `account_unfrozen:${strikeId}`, { strikeId });
      await deps.afterHoldChange(input.subject, "released", strikeId);
    }
  } catch (err) {
    // The strike is committed; a failed notice is logged, never undone.
    console.error("[standing] notice failed", effect, input.subject.type, input.subject.id, err);
  }
  return { ok: true, effect, standing: done.standing, strikeId };
}

export type AcknowledgeDeps = {
  /** Marks the person's own unacknowledged warnings acknowledged (only rows of this subject), returning how many. */
  acknowledge(subject: { type: StrikeSubject; id: string }, ids: string[] | null, at: Date): Promise<number>;
  now(): Date;
};

/** The person clicked Acknowledge. Idempotent: a second click acknowledges nothing and still answers ok. */
export async function acknowledgeWarning(deps: AcknowledgeDeps, subject: { type: StrikeSubject; id: string }): Promise<{ ok: true; acknowledged: number }> {
  return { ok: true, acknowledged: await deps.acknowledge(subject, null, deps.now()) };
}

export { pendingWarningIds };
