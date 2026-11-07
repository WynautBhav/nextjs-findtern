/**
 * Why each profile step matters, in the candidate's words. Keyed by the ids
 * `profileCompletion` returns; the rule itself stays in lib/onboarding.
 */
const WHY: Record<string, { label?: string; why: string }> = {
  photo: { why: "Employers see your photo next to your score, so add a clear one." },
  about: { label: "Your address", why: "Lets employers match you to cities and is printed on your agreement." },
  identity: {
    label: "Identity documents for payouts",
    why: "Aadhaar and PAN numbers and your PAN card image, so stipends can be paid and tax-filed. Never shown to employers before a hire.",
  },
  emergency: { why: "Someone we can reach if you are unreachable during an internship." },
  academics: { why: "Employers filter by degree, college and graduation year first." },
  skills: { why: "Skills are what employers search. They also drive the match on open roles." },
  languages: { why: "Shows which languages you can work in with a team or client." },
  location: { why: "Tells employers where you can work: remote, hybrid or on-site." },
  laptop: { why: "Many roles need your own laptop; this saves a round of questions." },
  agreement: { why: "Required before any company can hire you through Findtern." },
};

export function completionWhy(id: string): { label: string | null; why: string } {
  const row = WHY[id];
  return { label: row?.label ?? null, why: row?.why ?? "Required to complete your profile." };
}
