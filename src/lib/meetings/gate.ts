import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The pre-join gate at /meet/<token>: the disclaimer, the countdown rule and the signed "gate opened at" stamp.
 * Pure and alias-free so `node --test` runs it.
 *
 * HONEST LIMITS. The gate is a recorded agreement, not an access control: anyone who already holds the raw Meet URL can open
 * it without the gate. What keeps that rare: the Meet URL is never put in emails, .ics files or page props (Phase 1 and
 * `maskMeetingLink`), and this gate is the only place that reveals it, after an acceptance. Closing it for real means
 * restricting the Meet space (access type RESTRICTED/TRUSTED, host management) through the Google Meet REST API. TODO(S0 spike):
 * the Calendar-only client in src/lib/google.ts (`calendar.events` scope) cannot set that; do not guess at it.
 *
 * The countdown runs in the browser, so the server does not trust it: the page is rendered with a stamp signed over
 * (token, role, user, version, started-at), and the accept call must present it at least MIN_ELAPSED_MS later.
 */

import { DISCLAIMER_VERSION } from "./gate-text.ts";

export { DISCLAIMER, DISCLAIMER_VERSION, GATE_SECONDS, MASKED_MEET_LINK, maskMeetingLink } from "./gate-text.ts";

/** The server's floor: a little under GATE_SECONDS so network and clock rounding never reject an honest wait. */
export const MIN_ELAPSED_MS = 9_000;
/** A stamp older than this is stale: reload to start the countdown again. */
export const STAMP_MAX_AGE_MS = 30 * 60_000;

export type GateRole = "employer" | "intern";

/** The signing key: the same secret the session uses (never logged). */
export function gateSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return s;
}

const mac = (secret: string, label: string, data: string) => createHmac("sha256", secret).update(`${label}|${data}`).digest("base64url");

export type GateWho = { token: string; role: GateRole; uid: string; version: string };

/** The stamp the page embeds when the gate opens: `<startedAtMs>.<signature>`. */
export function signGateStart(secret: string, who: GateWho, startedAt: number): string {
  return `${startedAt}.${mac(secret, "gate-start", `${who.token}|${who.role}|${who.uid}|${who.version}|${startedAt}`)}`;
}

/** The stamp for a gate that opens now (the page calls this when it renders the countdown). */
export const openGateStamp = (who: GateWho): string => signGateStart(gateSecret(), who, Date.now());

export type GateCheck = { ok: true } | { ok: false; reason: "invalid" | "too_early" | "stale" };

/** Accept only a genuine stamp for this exact meeting, person and version, old enough but not stale. */
export function checkGateStart(secret: string, who: GateWho, stamp: unknown, now: number): GateCheck {
  if (typeof stamp !== "string") return { ok: false, reason: "invalid" };
  const [ms, sig, extra] = stamp.split(".");
  const startedAt = Number(ms);
  if (extra !== undefined || !sig || !/^\d{10,15}$/.test(ms) || !Number.isSafeInteger(startedAt)) return { ok: false, reason: "invalid" };
  const want = Buffer.from(mac(secret, "gate-start", `${who.token}|${who.role}|${who.uid}|${who.version}|${startedAt}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "invalid" };
  const elapsed = now - startedAt;
  if (elapsed < 0) return { ok: false, reason: "invalid" };
  if (elapsed < MIN_ELAPSED_MS) return { ok: false, reason: "too_early" };
  if (elapsed > STAMP_MAX_AGE_MS) return { ok: false, reason: "stale" };
  return { ok: true };
}

/** True when the person has not yet agreed to the CURRENT version for this meeting. */
export const needsGate = (acceptedVersions: readonly string[], version: string = DISCLAIMER_VERSION): boolean => !acceptedVersions.includes(version);

/** Salted hash of the client IP; null when the address is unknown. The raw IP is never stored or logged. */
export function ipHash(secret: string, ip: string | null | undefined): string | null {
  const v = (ip ?? "").trim();
  if (!v || v === "unknown") return null;
  return mac(secret, "gate-ip", v).slice(0, 32);
}
