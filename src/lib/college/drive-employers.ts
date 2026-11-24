// The drive's Employers panel: who came, who did not, and what each company did. Pure, so node:test runs it.
// Relative imports only.

import { isOnline } from "../presence-logic.ts";
import { matchInvites, type CameEmployer, type Invite } from "./drive-board.ts";
import { ago } from "./labels.ts";

const HIRED = new Set(["hired", "completed"]);

/** One employer's counts inside the drive. */
export type EmployerCounts = { meetings: number; offers: number; hires: number };

export type MeetingFact = { employerId: string; status: string };
/** A proposal from an employer to one of the drive's students, inside the drive window, not draft or withdrawn. */
export type OfferFact = { employerId: string; userId: string; status: string; hiredAt: Date | null };

/**
 * Meetings: requests that were not cancelled (the drive's "asked to meet"). Offers: every proposal sent, one by one.
 * Hires: students hired by that employer (hiredAt set, or status hired/completed), each student once.
 */
export function countByEmployer(meetings: MeetingFact[], offers: OfferFact[]): Map<string, EmployerCounts> {
  const out = new Map<string, EmployerCounts>();
  const hired = new Map<string, Set<string>>();
  const get = (id: string) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = { meetings: 0, offers: 0, hires: 0 }));
    return c;
  };
  for (const m of meetings) if ((m.status ?? "").toLowerCase() !== "cancelled") get(m.employerId).meetings++;
  for (const o of offers) {
    get(o.employerId).offers++;
    if (o.hiredAt !== null || HIRED.has((o.status ?? "").toLowerCase())) {
      const set = hired.get(o.employerId) ?? new Set<string>();
      set.add(o.userId);
      hired.set(o.employerId, set);
    }
  }
  for (const [id, set] of hired) get(id).hires = set.size;
  return out;
}

export type EmployerStatus =
  | { kind: "online" }
  | { kind: "seen"; label: string }
  | { kind: "never" }
  | { kind: "came" } // a finished drive: "online now" no longer means anything
  | { kind: "absent" };

export type EmployerRow = {
  key: string;
  /** Null for an invited company that never came: nothing to open. */
  employerId: string | null;
  company: string;
  contact: string | null;
  /** For chasing: the company's phone and email (an invite that never came has its email only). */
  phone: string | null;
  email: string | null;
  invited: boolean;
  joinedAt: Date | null;
  status: EmployerStatus;
  meetings: number;
  offers: number;
  hires: number;
};

export type DriveEmployers = {
  rows: EmployerRow[];
  inDrive: number;
  online: number;
  invitedMissing: number;
};

/** Came-in companies first (in the order they joined), then invited companies that did not show up. */
export function buildDriveEmployers(input: {
  came: CameEmployer[];
  invited: Invite[];
  counts: Map<string, EmployerCounts>;
  /** employerId -> last heartbeat. */
  lastSeen: Map<string, Date>;
  over: boolean;
  now?: number;
}): DriveEmployers {
  const now = input.now ?? Date.now();
  const none: EmployerCounts = { meetings: 0, offers: 0, hires: 0 };
  let online = 0;
  const rows: EmployerRow[] = input.came.map((c) => {
    const seen = input.lastSeen.get(c.employerId) ?? null;
    let status: EmployerStatus;
    if (input.over) status = { kind: "came" };
    else if (isOnline(seen, now)) status = { kind: "online" };
    else if (seen) status = { kind: "seen", label: `Last seen ${ago(seen.toISOString(), now)}` };
    else status = { kind: "never" };
    if (status.kind === "online") online++;
    return {
      key: c.employerId,
      employerId: c.employerId,
      company: c.company ?? "Employer",
      contact: c.contact,
      phone: c.phone,
      email: c.email,
      // Invited when some invite points at this company (same email or name).
      invited: matchInvites(input.invited, [c]).arrived.length > 0,
      joinedAt: c.joinedAt,
      status,
      ...(input.counts.get(c.employerId) ?? none),
    };
  });
  const { missing } = matchInvites(input.invited, input.came);
  for (const [i, m] of missing.entries()) {
    rows.push({ key: `missing-${i}-${m.email}`, employerId: null, company: m.company, contact: null, phone: null, email: m.email, invited: true, joinedAt: null, status: { kind: "absent" }, ...none });
  }
  return { rows, inDrive: input.came.length, online, invitedMissing: missing.length };
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** "3 in the drive · 1 online now · 1 invited didn't come". Online is left out once the drive is over. */
export function employersLine(d: DriveEmployers, over: boolean): string {
  const parts = [`${d.inDrive.toLocaleString("en-IN")} in the drive`];
  if (!over) parts.push(`${d.online.toLocaleString("en-IN")} online now`);
  if (d.invitedMissing) parts.push(`${count(d.invitedMissing, "invited company", "invited companies")} didn't come`);
  return parts.join(" · ");
}

export function employerHref(driveId: string, employerId: string): string {
  return `/college/drives/${driveId}?employer=${encodeURIComponent(employerId)}#board`;
}
