/**
 * What crosses from the server to the Candidates region in the browser, and the ONE place that decides what a candidate
 * looks like on that wire. The page (first paint) and the results endpoint both build their rows through `toResultsWire`,
 * so a redaction rule cannot be right on one and forgotten on the other. No database in this file: the region imports it too.
 *
 * Rows carry only what a card shows. Before a paid hire: no name (initials only), no email, link or recording, no exact
 * college or course list, no profile `updatedAt`. The photo is the avatar route (never a file name) and only when one was
 * uploaded: photos show before hire (owner call, 6 Nov).
 */

import { redactForEmployer, type CandidateProfile } from "./employer-candidates.ts";
import type { CandidatesData, Filters, ProData } from "./candidates-params.ts";
import type { CandidateRelation } from "./employer-visibility.ts";
import type { Currency } from "./employer-pricing.ts";
import type { RelaxCounts } from "../components/employer/candidate-view.ts";
import type { schema } from "./db/index.ts";
import type { CollegeOption } from "./candidate-pro-filters.ts";

/** A card's candidate: `redactForEmployer` plus the fields no card uses taken off. */
export function cardCandidate(profile: CandidateProfile, unlocked: boolean): CandidateProfile {
  const redacted = redactForEmployer(profile, unlocked);
  const a = redacted.academics;
  return {
    ...redacted,
    // The list never shows contact details, so they stay off the wire even after hire.
    email: "",
    linkedinUrl: "",
    aiRecordingLink: null,
    aiFeedbackLink: redacted.aiFeedbackLink ?? null,
    // JSON has no Date: a card does not show when a profile was last edited.
    updatedAt: null,
    academics: a ? { ...a, institution: "", courses: [] } : null,
  };
}

export type CardRow = {
  candidate: CandidateProfile;
  relation: Pick<CandidateRelation, "proposal" | "expired" | "pendingMeetingAt"> | null;
  presence: string | null;
  interested: boolean;
  shortlisted: boolean;
  nameUnlocked: boolean;
};

export type ProResults = Pick<ProData, "active" | "ignored" | "hiddenNoScore" | "approxKept" | "colleges">;

/** Everything that depends on the filters. This is the endpoint's body. */
export type ResultsWire = {
  /** The filters as the server settled them (project corrected, Pro emptied without a subscription). */
  filters: Filters;
  /** Set when the visit should restore saved filters (a link with no filters): the client follows it. */
  restoreTo: string | null;
  loadFailed: boolean;
  total: number;
  pages: number;
  rows: CardRow[];
  activeProjectId: string | null;
  activeProjectSkills: string[];
  effectiveSkills: string[];
  projectApplied: CandidatesData["projectApplied"];
  includeRemote: boolean;
  cityList: string[];
  cityDefault: string;
  savedCount: number;
  pro: ProResults;
  relaxCounts: RelaxCounts | null;
};

/** What does not change with the filters: sent once with the page. */
export type ChromeWire = {
  uid: string;
  projects: { id: string; projectName: string; locationType: string | null; state: string | null }[];
  plans: (typeof schema.pricingPlans.$inferSelect)[];
  currency: Currency;
  region: "IN" | null;
  proOffer: Pick<ProData, "offered" | "charge" | "periodDays">;
};

export function toResultsWire(data: CandidatesData, filters: Filters): ResultsWire {
  return {
    filters,
    restoreTo: data.restoreTo,
    loadFailed: data.loadFailed,
    total: data.total,
    pages: data.pages,
    rows: data.candidates.map((candidate) => {
      const rel = data.relations.get(candidate.id);
      const unlocked = data.nameUnlocked.has(candidate.id);
      return {
        candidate: cardCandidate(candidate, unlocked),
        relation: rel ? { proposal: rel.proposal, expired: rel.expired, pendingMeetingAt: rel.pendingMeetingAt } : null,
        presence: data.presence[candidate.id] ?? null,
        interested: data.saved.has(candidate.id),
        shortlisted: data.shortlisted.has(candidate.id),
        nameUnlocked: unlocked,
      };
    }),
    activeProjectId: data.activeProjectId,
    activeProjectSkills: data.activeProjectSkills,
    effectiveSkills: data.effectiveSkills,
    projectApplied: data.projectApplied,
    includeRemote: data.includeRemote,
    cityList: data.cityList,
    cityDefault: data.cityDefault,
    savedCount: data.savedCount,
    pro: { active: data.pro.active, ignored: data.pro.ignored, hiddenNoScore: data.pro.hiddenNoScore, approxKept: data.pro.approxKept, colleges: data.pro.colleges },
    relaxCounts: data.relaxCounts,
  };
}

export function toChromeWire(uid: string, data: CandidatesData): ChromeWire {
  return {
    uid,
    projects: data.projects,
    plans: data.plans,
    currency: data.currency,
    region: data.region,
    proOffer: { offered: data.pro.offered, charge: data.pro.charge, periodDays: data.pro.periodDays },
  };
}

/** The same shape the server page renders from, rebuilt in the browser, so the existing components run unchanged. */
export function fromWire(chrome: ChromeWire, results: ResultsWire): { data: CandidatesData; filters: Filters } {
  const relations = new Map<string, CandidateRelation>();
  const presence: Record<string, string | null> = {};
  const shortlisted = new Set<string>();
  const saved = new Set<string>();
  const nameUnlocked = new Set<string>();
  for (const row of results.rows) {
    const id = row.candidate.id;
    if (row.relation) relations.set(id, { ...row.relation, hired: false, fullTimeFrom: null });
    presence[id] = row.presence;
    if (row.shortlisted) shortlisted.add(id);
    if (row.interested) saved.add(id);
    if (row.nameUnlocked) nameUnlocked.add(id);
  }
  const data: CandidatesData = {
    restoreTo: results.restoreTo,
    loadFailed: results.loadFailed,
    candidates: results.rows.map((r) => r.candidate),
    total: results.total,
    pages: results.pages,
    currency: chrome.currency,
    region: chrome.region,
    projects: chrome.projects,
    shortlisted,
    activeProjectId: results.activeProjectId,
    activeProjectSkills: results.activeProjectSkills,
    effectiveSkills: results.effectiveSkills,
    projectApplied: results.projectApplied,
    includeRemote: results.includeRemote,
    cityList: results.cityList,
    cityDefault: results.cityDefault,
    nameUnlocked,
    plans: chrome.plans,
    relations,
    presence,
    saved,
    savedCount: results.savedCount,
    pro: { ...results.pro, offered: chrome.proOffer.offered, charge: chrome.proOffer.charge, periodDays: chrome.proOffer.periodDays },
    relaxCounts: results.relaxCounts,
  };
  return { data, filters: results.filters };
}

export type { CollegeOption };
