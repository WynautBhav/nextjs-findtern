import { certificateFiles } from "../onboarding.ts";

/**
 * The files on a candidate's record, in the order legacy's Documents tab
 * listed them: photo, intro video, Aadhaar, PAN, every marksheet, every
 * course / certificate file. Pure so it can be tested without a database.
 */

export type CandidateDocument = {
  /** Stored name (new storage key or legacy upload name). */
  key: string;
  label: string;
  /** "Identity", "Media", "Academics". */
  group: "Media" | "Identity" | "Academics";
  contentType: string | null;
  size: number | null;
};

type DocsRow = {
  profilePhotoName?: string | null;
  profilePhotoType?: string | null;
  profilePhotoSize?: number | null;
  introVideoName?: string | null;
  introVideoType?: string | null;
  introVideoSize?: number | null;
  aadhaarImageName?: string | null;
  aadhaarImageType?: string | null;
  aadhaarImageSize?: number | null;
  panImageName?: string | null;
  panImageType?: string | null;
  panImageSize?: number | null;
};

/** Slots legacy always listed, filled or not. */
export const DOCUMENT_SLOTS = ["Profile photo", "Intro video", "Aadhaar card", "PAN card"] as const;

export function listCandidateDocuments(docs: DocsRow | null, extra: Record<string, unknown> | null): CandidateDocument[] {
  const out: CandidateDocument[] = [];
  const push = (key: string | null | undefined, label: string, group: CandidateDocument["group"], type?: string | null, size?: number | null) => {
    const k = typeof key === "string" ? key.trim() : "";
    if (k) out.push({ key: k, label, group, contentType: type ?? null, size: typeof size === "number" ? size : null });
  };
  push(docs?.profilePhotoName, "Profile photo", "Media", docs?.profilePhotoType, docs?.profilePhotoSize);
  push(docs?.introVideoName, "Intro video", "Media", docs?.introVideoType, docs?.introVideoSize);
  push(docs?.aadhaarImageName, "Aadhaar card", "Identity", docs?.aadhaarImageType, docs?.aadhaarImageSize);
  push(docs?.panImageName, "PAN card", "Identity", docs?.panImageType, docs?.panImageSize);

  const academics = extra?.academics && typeof extra.academics === "object" ? (extra.academics as Record<string, unknown>) : {};
  const sheets = Array.isArray(academics.marksheetUploads) ? academics.marksheetUploads : [];
  sheets.forEach((raw, i) => {
    const m = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const label = typeof m.label === "string" && m.label.trim() ? `Marksheet: ${m.label.trim()}` : `Marksheet ${i + 1}`;
    push(typeof m.name === "string" ? m.name : null, label, "Academics", typeof m.type === "string" ? m.type : null, typeof m.size === "number" ? m.size : null);
  });
  for (const c of certificateFiles(academics)) {
    push(c.name, c.originalName ? `${c.label} (${c.originalName})` : c.label, "Academics", c.type || null, c.size || null);
  }
  // A key listed twice (same file on two rows) opens the same file; show it once.
  return out.filter((d, i) => out.findIndex((x) => x.key === d.key) === i);
}
