import type { OnboardingDraft, StoredDocument } from "@/lib/onboarding";

export const STEPS = [
  { id: "about", title: "About you", blurb: "Your photo, identity documents, address and the numbers we can reach you on." },
  { id: "academics", title: "Academics", blurb: "Your highest qualification, marksheets, and any professional courses or certificates." },
  { id: "experience", title: "Experience", blurb: "Internships, jobs, projects or freelance work. Optional, but every entry needs its details." },
  { id: "skills", title: "Skills", blurb: "Four to seven skills, each rated honestly. Your AI interview is built on them." },
  { id: "languages", title: "Languages", blurb: "The languages you can work in, and how well you read, write and speak them." },
  { id: "extracurricular", title: "Activities", blurb: "Clubs, competitions, volunteering and leadership outside your coursework. Optional." },
  { id: "preferences", title: "Work preferences", blurb: "How you want to work, where, and whether you have a laptop." },
  { id: "preview", title: "Review", blurb: "Check your profile the way an employer reads it, then submit." },
] as const;

export type Update = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => void;

export type StepProps = {
  values: OnboardingDraft;
  update: Update;
  /** Errors to show now: fields touched, or the whole step after Continue. */
  errors: Record<string, string>;
  documents: StoredDocument[];
  email: string;
  /** The number on the account (captured at signup). */
  account: { countryCode: string; phoneNumber: string } | null;
  hasPanImage: boolean;
  hasAadhaarImage: boolean;
  /** Skills are frozen: rated, or an AI interview is open. */
  skillsLocked: boolean;
  onUploaded: (kind: "pan" | "aadhaar" | "profile_photo" | "intro_video") => void;
  onJumpStep: (step: number) => void;
};
