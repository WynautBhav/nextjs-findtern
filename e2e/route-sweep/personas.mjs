/**
 * Accounts the route sweep signs in as: the `scripts/seed.ts` demo logins and
 * the `scripts/seed-colleges.ts` placement officer. LOCAL scratch database only.
 * Override the intern with SWEEP_INTERN_EMAIL / SWEEP_INTERN_PASSWORD to cover
 * the unlocked states (e.g. the hired QA persona from e2e/lib/personas.mjs).
 */
const PW = "Findtern@2026";

export const SWEEP_PERSONAS = {
  intern: { email: process.env.SWEEP_INTERN_EMAIL || "candidate@findtern.dev", password: process.env.SWEEP_INTERN_PASSWORD || PW, api: "/api/auth/login" },
  employer: { email: "hiring@northwind.dev", password: PW, api: "/api/auth/employer/login" },
  college: { email: "tpo@jklu.edu.in", password: PW, api: "/api/auth/college/login" },
  admin: { email: "admin@findtern.dev", password: PW, api: "/api/auth/admin/login" },
};
