import type { InternRow } from "./intern-query.ts";

/**
 * One catalog for the Candidates table, its "Columns" menu and the export, so
 * what is visible on screen is what lands in the file. Pure: no DB imports.
 */

export type InternColKey =
  | "email" | "phone" | "interview" | "score" | "profile" | "onboarded"
  | "pending" | "next" | "total" | "paid" | "left" | "live"
  | "offerType" | "internship" | "fee" | "offerStatus"
  | "bankHolder" | "bankAccount" | "bankIfsc" | "bankName" | "bankUpi"
  | "account" | "review" | "joined";

export type ColGroup = "Candidate" | "Hiring" | "Money" | "Bank" | "Account";

/** A file cell: text stays text (account numbers, IFSC, phone), money and numbers stay numeric. */
export type ExportColumn = { header: string; kind?: "money" | "num"; value: (row: InternRow) => string | number | null };

type Def = {
  key: InternColKey;
  label: string;
  group: ColGroup;
  defaultOn?: boolean;
  /** `?sort=` key the DataTable header links to. */
  sort?: string;
  export: ExportColumn[];
};

const IST = "Asia/Kolkata";
/** YYYY-MM-DD in IST. */
const istDay = (d: Date | null) => (d ? d.toLocaleDateString("sv-SE", { timeZone: IST }) : "");
/** YYYY-MM-DD HH:mm in IST. */
const istStamp = (d: Date | null) => (d ? d.toLocaleString("sv-SE", { timeZone: IST }).slice(0, 16) : "");
const rupees = (minor: number | null | undefined) => Number(((minor ?? 0) / 100).toFixed(2));
const humanize = (s: string) => s.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

export const AI_STATUS_LABEL: Record<string, string> = {
  not_applied: "Waiting",
  applied: "Applied",
  scheduled: "Scheduled",
  sent: "Sent",
  expired: "Expired",
  completed: "Completed",
};
export const aiStatusLabel = (s: string) => AI_STATUS_LABEL[s] ?? humanize(s);

export const OFFER_STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  sent: "Sent",
  rejected: "Rejected",
  draft: "Draft",
  interview_scheduled: "Interview scheduled",
};
export const offerStatusLabel = (r: Pick<InternRow, "hired" | "offerStatus">) =>
  r.hired ? "Hired" : r.offerStatus ? (OFFER_STATUS_LABEL[r.offerStatus] ?? humanize(r.offerStatus)) : "";

export const liveLabel = (r: Pick<InternRow, "visibility" | "openToWork">) =>
  r.visibility === "hidden" ? "Hidden by admin" : !r.openToWork ? "Hidden by candidate" : "Live";

export const offerTypeLabel = (r: Pick<InternRow, "hired" | "fullTime">) => (r.fullTime ? "Full-time" : r.hired ? "Internship" : "");
export const internshipLabel = (r: Pick<InternRow, "hired" | "projectStatus">) =>
  r.hired ? (r.projectStatus === "completed" ? "Completed" : "Ongoing") : "";

const one = (header: string, value: ExportColumn["value"], kind?: ExportColumn["kind"]): ExportColumn[] => [{ header, value, kind }];

export const INTERN_COLUMNS: Def[] = [
  { key: "email", label: "Email", group: "Candidate", export: one("Email", (r) => r.email) },
  { key: "phone", label: "Phone", group: "Candidate", export: one("Phone", (r) => r.phone ?? "") },
  {
    key: "interview",
    label: "AI interview",
    group: "Candidate",
    defaultOn: true,
    export: [
      { header: "AI interview", value: (r) => aiStatusLabel(r.aiStatus) },
      { header: "AI interview date (IST)", value: (r) => (r.aiStatus === "scheduled" || r.aiStatus === "completed" ? istStamp(r.interviewAt ?? null) : "") },
    ],
  },
  { key: "score", label: "Findtern score", group: "Candidate", defaultOn: true, sort: "score", export: one("Findtern score", (r) => (r.score == null ? null : Number(r.score.toFixed(1))), "num") },
  { key: "profile", label: "Profile", group: "Candidate", export: one("Profile", (r) => (r.hasProfile ? "Complete" : "Incomplete")) },
  { key: "onboarded", label: "Onboarding", group: "Hiring", export: one("Onboarding", (r) => (r.hired ? "Onboarded" : "Not onboarded")) },
  { key: "pending", label: "Pending payout", group: "Money", export: one("Pending payout (INR)", (r) => rupees(r.money?.pendingPayoutMinor), "money") },
  { key: "next", label: "Upcoming payment date", group: "Money", defaultOn: true, sort: "next", export: one("Upcoming payment date", (r) => r.money?.nextDate ?? "") },
  { key: "total", label: "Total to pay", group: "Money", export: one("Total to pay (INR)", (r) => rupees(r.money?.totalMinor), "money") },
  { key: "paid", label: "Paid till now", group: "Money", export: one("Paid till now (INR)", (r) => rupees(r.money?.paidMinor), "money") },
  { key: "left", label: "Left to pay", group: "Money", defaultOn: true, sort: "owed", export: one("Left to pay (INR)", (r) => rupees(r.money?.owedMinor), "money") },
  { key: "live", label: "Live / Hidden", group: "Account", defaultOn: true, export: one("Live / Hidden", liveLabel) },
  { key: "offerType", label: "Offer type", group: "Hiring", export: one("Offer type", offerTypeLabel) },
  { key: "internship", label: "Internship status", group: "Hiring", export: one("Internship status", internshipLabel) },
  { key: "fee", label: "Activation fee", group: "Hiring", export: one("Activation fee", (r) => (r.feePaid ? "Paid" : "Unpaid")) },
  { key: "offerStatus", label: "Offer status", group: "Hiring", defaultOn: true, export: one("Offer status", offerStatusLabel) },
  { key: "bankHolder", label: "Account holder", group: "Bank", export: one("Account holder", (r) => r.bank?.holder ?? "") },
  { key: "bankAccount", label: "Account number", group: "Bank", export: one("Account number", (r) => r.bank?.account ?? "") },
  { key: "bankIfsc", label: "IFSC", group: "Bank", export: one("IFSC", (r) => r.bank?.ifsc ?? "") },
  { key: "bankName", label: "Bank name", group: "Bank", export: one("Bank name", (r) => r.bank?.name ?? "") },
  { key: "bankUpi", label: "UPI", group: "Bank", export: one("UPI", (r) => r.bank?.upi ?? "") },
  { key: "account", label: "Status", group: "Account", defaultOn: true, export: one("Status", (r) => (r.isActive ? "Active" : "Inactive")) },
  { key: "review", label: "Review", group: "Candidate", defaultOn: true, export: one("Review", (r) => r.approval ?? "Pending") },
  { key: "joined", label: "Joined", group: "Candidate", defaultOn: true, sort: "created", export: one("Joined", (r) => istDay(r.createdAt)) },
];

const KEYS = INTERN_COLUMNS.map((c) => c.key);
export const DEFAULT_COLS = new Set<InternColKey>(INTERN_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key));

/** Whitelisted keys from a comma list; empty or invalid gives the default, "all" gives every column. */
export function parseCols(raw?: string | null): Set<InternColKey> {
  if (raw === "all") return new Set(KEYS);
  const asked = new Set((raw ?? "").split(",").map((k) => k.trim()));
  const picked = KEYS.filter((k) => asked.has(k));
  return picked.length ? new Set(picked) : new Set(DEFAULT_COLS);
}

/** Cookie value `<adminUid>|key,key`: only honoured for the same admin. */
export function colsFromCookie(raw: string | undefined, uid: string): string | undefined {
  const i = raw ? raw.indexOf("|") : -1;
  return raw && i > 0 && raw.slice(0, i) === uid ? raw.slice(i + 1) : undefined;
}

export const needsBankExport = (cols: Set<InternColKey>) => cols.has("bankAccount");
export const needsBank = (cols: Set<InternColKey>) => KEYS.some((k) => k.startsWith("bank") && cols.has(k));

/** Name first, then the visible columns in catalog order. */
export function internExportColumns(cols: Set<InternColKey>): ExportColumn[] {
  return [
    { header: "Name", value: (r) => `${r.firstName} ${r.lastName}`.trim() },
    ...INTERN_COLUMNS.filter((c) => cols.has(c.key)).flatMap((c) => c.export),
  ];
}

/** The sheet for `buildXlsx`: header row, one row per intern, and which columns are money. */
export function internSheet(rows: InternRow[], cols: Set<InternColKey>) {
  const ex = internExportColumns(cols);
  return {
    rows: [ex.map((c) => c.header), ...rows.map((r) => ex.map((c) => c.value(r)))],
    moneyCols: ex.flatMap((c, i) => (c.kind === "money" ? [i] : [])),
  };
}
