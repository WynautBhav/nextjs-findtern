import { aiExpiryLabel, daysSince, expiredAiRows, filterExpiredAi, parseExpiredAiFilters, type AiExpiryInput, type ExpiredAiRow } from "./ai-interview-expiry.ts";
import { csvFilename, csvResponse, toCsv, type CsvColumn } from "./csv.ts";
import { allows } from "./permissions.ts";
import { EXPIRY_LABEL } from "../proposal-expiry.ts";
import { filterExpired, offerFacts, parseExpiredFilters, type ExpiredRow } from "./tracker.ts";

/**
 * The expired-offers and expired-AI-interviews CSV (GET /api/admin/expired?type=proposals|ai). Everything the route
 * does lives here with its loaders injected, so a test drives it with fakes: gate, filters, cap, columns.
 * A read, so no CSRF token and no state change; permission `interns:read` (the page rule), re-checked here.
 */

export const MAX_EXPORT_ROWS = 10_000;

export type AiExpiryListRow = AiExpiryInput & { interviewId: string; name: string; email: string; phone: string };

export type ExpiredExportDeps = {
  session: () => Promise<{ role: string; permissions?: readonly string[] } | null>;
  /** Every expired offer (real employers only), computed at `now`. */
  loadProposals: (now: Date) => Promise<ExpiredRow[]>;
  /** Every AI interview row with its link-sent time, and the configured expiry days. */
  loadAi: () => Promise<{ rows: AiExpiryListRow[]; days: number }>;
  now: () => Date;
};

const day = (d: Date | null) => (d ? d.toISOString() : "");
const major = (minor: number | null) => (minor === null ? "" : (minor / 100).toFixed(2));

export function proposalColumns(now: Date): CsvColumn<ExpiredRow>[] {
  return [
    { header: "Reason", value: (r) => EXPIRY_LABEL[r.reason] },
    { header: "Company", value: (r) => r.companyName },
    { header: "Project", value: (r) => r.projectName },
    { header: "Candidate", value: (r) => `${r.internFirstName ?? ""} ${r.internLastName ?? ""}`.trim() },
    { header: "Candidate email", value: (r) => r.internEmail },
    { header: "Start date", value: (r) => offerFacts(r).startDay },
    { header: "Expired at", value: (r) => day(r.at) },
    { header: "Expired at is approximate", value: (r) => (r.atApprox ? "yes" : "no") },
    { header: "Days since expiry", value: (r) => daysSince(r.at, now) },
    { header: "Offer type", value: (r) => (offerFacts(r).fullTime ? "full-time" : "internship") },
    { header: "Offer amount", value: (r) => major(offerFacts(r).amountMinor) },
    { header: "Offer amount basis", value: (r) => (offerFacts(r).fullTime ? "annual CTC" : "per month") },
    { header: "Months", value: (r) => offerFacts(r).months },
    { header: "Currency", value: (r) => offerFacts(r).currency },
    { header: "Status written", value: (r) => (r.persisted ? "yes" : "no, computed on read") },
    { header: "Proposal id", value: (r) => r.id },
  ];
}

export function aiColumns(now: Date, days: number): CsvColumn<ExpiredAiRow<AiExpiryListRow>>[] {
  return [
    { header: "Reason", value: (r) => aiExpiryLabel(r.reason, days) },
    { header: "Candidate", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "Phone", value: (r) => r.phone },
    { header: "Status", value: (r) => r.status },
    { header: "Link sent at", value: (r) => (r.meetingLink?.trim() ? day(r.linkSentAt ? new Date(r.linkSentAt) : null) : "") },
    { header: "Expired at", value: (r) => day(r.at) },
    { header: "Days since expiry", value: (r) => daysSince(r.at, now) },
    { header: "Interview id", value: (r) => r.interviewId },
  ];
}

const plain = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" } });

export async function handleExpiredExport(req: Request, deps: ExpiredExportDeps): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  const session = await deps.session();
  if (!session || session.role !== "admin") return plain("Sign in as an admin to download this.", 401);
  if (!allows(session.permissions, ["interns:read"])) return plain("Your role doesn't include this export. Ask a super admin for access.", 403);
  if (type !== "proposals" && type !== "ai") return plain('Unknown export type. Use type=proposals or type=ai.', 400);

  const params = Object.fromEntries(url.searchParams.entries());
  const now = deps.now();
  try {
    if (type === "proposals") {
      const rows = filterExpired(await deps.loadProposals(now), parseExpiredFilters(params)).sort((a, b) => (b.at?.getTime() ?? -Infinity) - (a.at?.getTime() ?? -Infinity));
      if (rows.length > MAX_EXPORT_ROWS) return plain("More than 10,000 offers match; narrow the filters.", 400);
      return csvResponse(toCsv(rows, proposalColumns(now)), csvFilename("expired-offers", now));
    }
    const { rows: all, days } = await deps.loadAi();
    const rows = filterExpiredAi(expiredAiRows(all, now, days), parseExpiredAiFilters(params)).sort((a, b) => (b.at?.getTime() ?? -Infinity) - (a.at?.getTime() ?? -Infinity));
    if (rows.length > MAX_EXPORT_ROWS) return plain("More than 10,000 interviews match; narrow the filters.", 400);
    return csvResponse(toCsv(rows, aiColumns(now, days)), csvFilename("expired-ai-interviews", now));
  } catch (error) {
    console.error("[admin/expired export]", error);
    return plain("Couldn't build the file. Nothing was changed. Try again in a moment.", 500);
  }
}
