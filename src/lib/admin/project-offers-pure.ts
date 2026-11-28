/**
 * The Projects page's offers pop-up: who a project's offers went to, by the Proposal pipeline's buckets. Pure, so the
 * row's "N offers" / "N hires", the pop-up's chips, its list and its CSV come from one array.
 */
import { csvCell } from "../../components/admin/dashboard/board/table-csv.ts";
import { parseOffer } from "../offer.ts";
import { isPpoOffer, PIPELINE_BUCKETS, PIPELINE_LABEL, proposalPipelineStatus, type PipelineBucket } from "./proposal-pipeline.ts";
import type { ExpiryInput } from "../proposal-expiry.ts";

export type OfferKind = "Internship" | "Full-time" | "PPO";

/** Internship, Full-time, or PPO (a full-time offer on top of an earlier proposal), from the offer itself. */
export function offerKind(offerDetails: unknown, currency: string | null): OfferKind {
  if (!parseOffer(offerDetails, currency).fullTime) return "Internship";
  return isPpoOffer(offerDetails, currency) ? "PPO" : "Full-time";
}

/**
 * Whether GET /api/proposals/[id]/offer-letter has a PDF to return. That route serves only a full-time offer's uploaded
 * letter (offerLetterKey or offerLetterUrl), whatever the status (sent, expired and withdrawn included); everything else is 404.
 */
export function offerPdf(offerDetails: unknown, currency: string | null): { available: true } | { available: false; reason: string } {
  const ft = parseOffer(offerDetails, currency).fullTime;
  if (!ft) return { available: false, reason: "Internship offers have no PDF letter" };
  if (!ft.offerLetterKey && !ft.offerLetterUrl) return { available: false, reason: "No offer letter was uploaded" };
  return { available: true };
}

/** A sent offer's bucket for counting on the project row (drafts: null). Hired does not depend on an open checkout. */
export function offerBucket(p: ExpiryInput & { status: string }, now: Date = new Date()): PipelineBucket | null {
  return proposalPipelineStatus(p, now);
}

/** The row's two numbers from the same rows the pop-up lists: every sent offer, and those in the Hired bucket. */
export function offerCounts(rows: readonly { bucket: PipelineBucket }[]): { sent: number; hires: number } {
  return { sent: rows.length, hires: rows.filter((r) => r.bucket === "hired").length };
}

/** "All" first, then every bucket that has rows, in the pipeline's order; each count is the rows that chip shows. */
export function offerChips(rows: readonly { bucket: PipelineBucket }[]): { key: PipelineBucket | "all"; label: string; count: number }[] {
  const chips: { key: PipelineBucket | "all"; label: string; count: number }[] = [{ key: "all", label: "All", count: rows.length }];
  for (const b of PIPELINE_BUCKETS) {
    const n = rows.filter((r) => r.bucket === b).length;
    if (n) chips.push({ key: b, label: PIPELINE_LABEL[b], count: n });
  }
  return chips;
}

export function filterOffers<R extends { bucket: PipelineBucket }>(rows: readonly R[], key: PipelineBucket | "all"): R[] {
  return key === "all" ? [...rows] : rows.filter((r) => r.bucket === key);
}

export type OfferListRow = { candidate: string; email: string | null; phone: string | null; kind: OfferKind; bucket: PipelineBucket; pay: string; sent: string };

export const OFFERS_CSV_HEAD = ["Student", "Email", "Phone", "Offer type", "Outcome", "Pay", "Sent"] as const;

/** Exactly the pop-up's columns, for exactly the rows it shows. */
export function offersCsv(rows: readonly OfferListRow[]): string[][] {
  return [[...OFFERS_CSV_HEAD], ...rows.map((r) => [r.candidate, r.email ?? "", r.phone ?? "", r.kind, PIPELINE_LABEL[r.bucket], r.pay, r.sent].map(csvCell))];
}

/** offers-<project>[-<outcome>].csv, ASCII letters, digits and dashes only. */
export function offersCsvFilename(projectName: string, outcome: PipelineBucket | "all"): string {
  const slug = projectName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
  return `offers-${slug}${outcome !== "all" ? `-${outcome}` : ""}.csv`;
}
