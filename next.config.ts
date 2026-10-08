import type { NextConfig } from "next";

/**
 * Legacy URL map.
 *
 * The rewrite moved every authenticated route under a role segment
 * (`/dashboard` → `/intern/dashboard`, `/proposals/:id` →
 * `/intern/proposals/[id]`) and the public role browser back to `/opportunities`.
 * Nothing redirected the old paths, so every link that already existed —
 * anything shared in Slack, printed in a placement pack, or indexed by a search
 * engine — landed on a 404. The legacy app had alias redirects for exactly this
 * reason, including a `/intern/*` → canonical alias set and a typo alias for
 * `/employer/shedule`.
 *
 * These are 308s so they are cached as permanent moves, which is what they are.
 * Each one is a route that used to exist; nothing is redirected to a page that
 * does not.
 */
const LEGACY_REDIRECTS: { from: string; to: string }[] = [
  // ── Intern: the legacy app served these at the root ──────────────────────
  { from: "/dashboard", to: "/intern/dashboard" },
  { from: "/dashboard/documents", to: "/intern/documents" },
  { from: "/earnings", to: "/intern/earnings" },
  { from: "/interviews", to: "/intern/interviews" },
  { from: "/timesheets", to: "/intern/timesheets" },
  { from: "/proposals", to: "/intern/proposals" },
  { from: "/proposals/:id", to: "/intern/proposals/:id" },
  { from: "/notifications", to: "/intern/notifications" },
  { from: "/settings", to: "/intern/settings" },
  { from: "/settings/change-password", to: "/intern/settings" },
  { from: "/edit-profile", to: "/intern/onboarding" },
  { from: "/onboarding", to: "/intern/onboarding" },
  { from: "/onboarding-loading", to: "/intern/onboarding" },
  { from: "/verify-email", to: "/signup" },

  // ── Employer: mostly the same paths, different account type ──────────────
  { from: "/employer", to: "/employer/dashboard" },
  { from: "/employer/setup", to: "/employer/onboarding" },
  { from: "/employer/profile", to: "/employer/account" },
  // The legacy typo alias, which was live long enough to be linked.
  { from: "/employer/shedule", to: "/employer/schedule" },
  { from: "/employer/proposals/:id/edit", to: "/employer/proposal/:id" },
  { from: "/employer/timesheet", to: "/employer/timesheets" },
  { from: "/employer/interns", to: "/employer/candidates" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      // OAuth bridges were client-side redirects into API routes on the legacy
      // site; the equivalents are real pages here.
      { source: "/auth/google/callback", destination: "/login", permanent: false },
      { source: "/auth/google/callback/auth", destination: "/login", permanent: false },
      { source: "/google/auth", destination: "/login", permanent: false },
      { source: "/google/callback", destination: "/login", permanent: false },
      // `/opportunities` is deliberately absent: it is a real route now (the
      // public browser), and it keeps the one legacy URL that should survive.
      ...LEGACY_REDIRECTS.map((r) => ({
        source: r.from,
        destination: r.to,
        permanent: true,
      })),
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;