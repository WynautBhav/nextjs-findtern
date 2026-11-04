import type { StudentRow } from "@/components/college/types";
import type { CollegeStudent } from "./scope";
import { driveWindow } from "./access.ts";
import { draftFromRecord, type OnboardingLike } from "../onboarding.ts";

export function toStudentRow(s: CollegeStudent): StudentRow {
  return {
    userId: s.userId,
    name: `${s.firstName} ${s.lastName}`.trim(),
    email: s.email,
    rollNo: s.rollNo,
    status: s.status,
    year: s.year,
    branch: s.branch,
    cgpa: s.cgpa,
    score: s.score,
    aiStatus: s.aiStatus,
    lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    lastActivityAt: s.lastActivityAt?.toISOString() ?? null,
    offersPending: s.offersPending,
    proposals: s.proposals,
    interviewsScheduled: s.interviewsScheduled,
    driveMeetings: s.driveMeetings,
    collegeId: s.collegeId,
    leftAt: null,
  };
}

/** AI report and recording: verified students only (WP8 / C9). */
export const canOpenArtifacts = (status: string) => status === "verified";

/** A TPO sees a drive's student-level data only while it is upcoming or live (WP8 / C12). */
export const driveDataOpen = (drive: Parameters<typeof driveWindow>[0], now = Date.now()) => {
  const w = driveWindow(drive, now);
  return w === "live" || w === "upcoming";
};

/**
 * What a TPO may read of a student's profile. Null unless verified. An
 * allowlist: Aadhaar, PAN, bank, address and PIN are never copied across.
 * No CV or portfolio field exists in onboarding data, so none is returned.
 */
export function tpoProfile(status: string, onboarding: OnboardingLike | undefined, phone: string | null) {
  if (status !== "verified") return null;
  const d = draftFromRecord(onboarding ?? {});
  const a = d.academics;
  return {
    phone,
    city: [d.city, d.state].filter(Boolean).join(", "),
    skills: d.skills ?? [],
    languages: (d.languages ?? []).filter((l) => l.language).map((l) => (l.level ? `${l.language} (${l.level})` : l.language)),
    education: a ? { institution: a.institution, degree: a.degree, branch: a.branch, year: a.yearOfGraduation, score: a.cgpa, scoreType: a.scoreType } : null,
    experience: (d.experiences ?? []).map((e) => ({ company: e.company, role: e.role, from: e.from, to: e.current ? "Present" : e.to, description: e.description })),
    bio: d.bio ?? "",
    links: { linkedin: d.linkedinUrl ?? "" },
  };
}
