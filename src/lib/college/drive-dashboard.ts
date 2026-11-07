/** Pure shaping for the TPO drive dashboard and the admin overview. No codes, phones, scores or money ever pass through here. */

export const DRIVE_STATUSES = ["not_invited", "code_sent", "activated", "interview_started", "interview_completed"] as const;
export type DriveStatus = (typeof DRIVE_STATUSES)[number];

export const DRIVE_STATUS_LABEL: Record<DriveStatus, string> = {
  not_invited: "Not invited",
  code_sent: "Code sent",
  activated: "Activated",
  interview_started: "Interview started",
  interview_completed: "Interview completed",
};

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 25;

export function isDriveStatus(v: unknown): v is DriveStatus {
  return typeof v === "string" && (DRIVE_STATUSES as readonly string[]).includes(v);
}

/** Entry state + code status + entitlement interview status to one display status. */
export function deriveStatus(input: {
  entryState: string;
  codeStatus: string | null;
  interviewStatus: string | null;
}): DriveStatus {
  if (input.entryState !== "valid") return "not_invited";
  if (input.interviewStatus) {
    const s = input.interviewStatus.toLowerCase();
    if (s === "completed" || s === "complete" || s === "done") return "interview_completed";
    if (s === "started" || s === "in_progress") return "interview_started";
    return "activated";
  }
  if (input.codeStatus === "redeemed") return "activated";
  if (input.codeStatus === "issued") return "code_sent";
  return "not_invited";
}

/** "a•••@domain": first letter and domain only. Anything malformed is fully hidden. */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return "•••";
  return `${e[0]}•••@${e.slice(at + 1)}`;
}

export function clampPage(pageRaw: unknown, sizeRaw: unknown): { page: number; pageSize: number; offset: number } {
  const p = Math.floor(Number(pageRaw));
  const s = Math.floor(Number(sizeRaw));
  const page = Number.isFinite(p) && p >= 1 ? Math.min(p, 100000) : 1;
  const pageSize = Number.isFinite(s) && s >= 1 ? Math.min(s, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export type OrderMetricsInput = { id: string; slots: number; issued: number; redeemed: number; status: string };
export type OrderMetrics = OrderMetricsInput & { pending: number; unused: number };

export function orderMetrics(o: OrderMetricsInput): OrderMetrics {
  const issued = Math.max(0, o.issued);
  const redeemed = Math.min(Math.max(0, o.redeemed), issued);
  return { ...o, issued, redeemed, pending: issued - redeemed, unused: Math.max(0, o.slots - issued) };
}

export function totals(orders: OrderMetricsInput[]): { slots: number; issued: number; redeemed: number; pending: number; unused: number } {
  const t = { slots: 0, issued: 0, redeemed: 0, pending: 0, unused: 0 };
  for (const o of orders) {
    const m = orderMetrics(o);
    t.slots += m.slots;
    t.issued += m.issued;
    t.redeemed += m.redeemed;
    t.pending += m.pending;
    t.unused += m.unused;
  }
  return t;
}

export type StudentRowInput = {
  id: string;
  collegeId: string;
  name: string;
  email: string;
  entryState: string;
  codeStatus: string | null;
  interviewStatus: string | null;
  redeemedAt: Date | null;
};
export type StudentRow = { id: string; name: string; email: string; status: DriveStatus; activatedAt: string | null };

/** Defence in depth: rows from another college are dropped even if a query widens. */
export function shapeStudents(rows: StudentRowInput[], collegeId: string): StudentRow[] {
  return rows
    .filter((r) => r.collegeId === collegeId)
    .map((r) => {
      const status = deriveStatus(r);
      return {
        id: r.id,
        name: r.name,
        email: maskEmail(r.email),
        status,
        activatedAt: status === "not_invited" || status === "code_sent" ? null : (r.redeemedAt?.toISOString() ?? null),
      };
    });
}

/** Escape LIKE wildcards in a user search term. */
export function likeTerm(q: string): string {
  return q.trim().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`);
}
