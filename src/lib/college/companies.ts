// Master data's Companies view: every company that took part in, or was invited to, this college's drives, one row each, for the
// officer to call again. Pure, so node:test runs it. Relative imports only.

import { csvCell } from "./master-row.ts";
import { matchInvites, type CameEmployer, type Invite } from "./drive-board.ts";
import type { EmployerCounts } from "./drive-employers.ts";

/** An invite as the officer typed it: the company and its email, and the contact name and phone when they gave them. */
export type InviteContact = Invite & { name?: string; phone?: string };

/** What one drive of this college knows about its companies. */
export type DriveFacts = {
  driveId: string;
  startsAt: Date;
  came: CameEmployer[];
  invited: InviteContact[];
  /** Per employerId, inside this drive (drive-employers.ts countByEmployer). */
  counts: Map<string, EmployerCounts>;
};

export type CompanyRow = {
  /** The employer id, or the invite's lower-cased email for a company that never came. */
  key: string;
  employerId: string | null;
  company: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  /** Came to at least one drive (false: invited only). */
  joined: boolean;
  /** Drives it came to or was invited to. */
  drives: number;
  lastDriveAt: Date;
  meetings: number;
  offers: number;
  hires: number;
  lastSeenAt: Date | null;
};

/**
 * One row per company across the drives given (the caller passes only this college's). A company that came is one row however
 * many drives it came to; an invite that matches a company that came (same email or name) is that company; any other invite
 * is a row of its own, once per email.
 */
export function buildCompanies(drives: DriveFacts[], lastSeen: Map<string, Date>): CompanyRow[] {
  const byKey = new Map<string, CompanyRow & { driveIds: Set<string> }>();
  const touch = (r: CompanyRow & { driveIds: Set<string> }, d: DriveFacts) => {
    r.driveIds.add(d.driveId);
    if (d.startsAt > r.lastDriveAt) r.lastDriveAt = d.startsAt;
  };
  const allCame: CameEmployer[] = [];

  for (const d of drives) {
    for (const c of d.came) {
      allCame.push(c);
      let r = byKey.get(c.employerId);
      if (!r) {
        r = { key: c.employerId, employerId: c.employerId, company: c.company ?? "Employer", contact: c.contact, email: c.email, phone: c.phone, joined: true, drives: 0, lastDriveAt: d.startsAt, meetings: 0, offers: 0, hires: 0, lastSeenAt: lastSeen.get(c.employerId) ?? null, driveIds: new Set() };
        byKey.set(c.employerId, r);
      }
      touch(r, d);
      const n = d.counts.get(c.employerId);
      if (n) {
        r.meetings += n.meetings;
        r.offers += n.offers;
        r.hires += n.hires;
      }
    }
  }

  for (const d of drives) {
    for (const i of d.invited) {
      const hit = allCame.find((c) => matchInvites([i], [c]).arrived.length > 0);
      let r = hit ? byKey.get(hit.employerId) : undefined;
      if (!r) {
        const key = i.email.trim().toLowerCase();
        r = byKey.get(key);
        if (!r) {
          r = { key, employerId: null, company: i.company, contact: i.name?.trim() || null, email: i.email, phone: i.phone?.trim() || null, joined: false, drives: 0, lastDriveAt: d.startsAt, meetings: 0, offers: 0, hires: 0, lastSeenAt: null, driveIds: new Set() };
          byKey.set(key, r);
        }
      }
      touch(r, d);
    }
  }

  return [...byKey.values()]
    .map(({ driveIds, ...row }) => ({ ...row, drives: driveIds.size }))
    .sort((a, b) => b.lastDriveAt.getTime() - a.lastDriveAt.getTime() || Number(b.joined) - Number(a.joined) || a.company.localeCompare(b.company));
}

const COLUMNS: { label: string; text: (r: CompanyRow) => string }[] = [
  { label: "Company", text: (r) => r.company },
  { label: "Contact person", text: (r) => r.contact ?? "" },
  { label: "Email", text: (r) => r.email ?? "" },
  { label: "Phone", text: (r) => r.phone ?? "" },
  { label: "Status", text: (r) => (r.joined ? "Took part" : "Invited, did not join") },
  { label: "Drives", text: (r) => String(r.drives) },
  { label: "Last drive", text: (r) => istDay(r.lastDriveAt) },
  { label: "Meets", text: (r) => String(r.meetings) },
  { label: "Offers", text: (r) => String(r.offers) },
  { label: "Hires", text: (r) => String(r.hires) },
  { label: "Last seen", text: (r) => (r.lastSeenAt ? istDay(r.lastSeenAt) : "") },
];

const istDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The download: every cell goes through csvCell, so a company that names itself "=HYPERLINK(...)" cannot run in the officer's spreadsheet. */
export function companiesCsv(rows: CompanyRow[]): string {
  const head = COLUMNS.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => COLUMNS.map((c) => csvCell(c.text(r))).join(","));
  // BOM so Excel opens the file as UTF-8.
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
