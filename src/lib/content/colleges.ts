import type { CmsCollegePitch } from "./types";

/**
 * "College partners" marketing copy. The partner list itself has no TS
 * fallback on purpose: a college appears only when Findtern staff tick "On
 * website" in /admin/colleges, so the site can never claim a partnership
 * that doesn't exist.
 */
export const COLLEGE_PITCH: CmsCollegePitch = {
  eyebrow: "For colleges",
  lead: "Run placement drives",
  accent: "without the chasing",
  sub: "Every student takes the same AI interview, so you walk into placement season knowing where your batch stands, and employers walk into your drive with scores they trust.",
  points: [
    {
      title: "Every student, interviewed once",
      body: "One unbiased AI interview per student, with the score, report and recording in your console. No faculty hours spent screening.",
    },
    {
      title: "A virtual drive is one link",
      body: "Set dates and cutoffs, send the link. Employers sign in and see only your eligible students: filter, shortlist, and call them on video in minutes.",
    },
    {
      title: "See who's online, chase who isn't",
      body: "On drive day you see who has Findtern open and who can be reached by phone alert, plus every offer a student is sitting on, each a one-tap nudge.",
    },
  ],
  cta: { label: "Bring Findtern to your college", href: "/contact" },
  loginHref: "/login?as=college",
};
