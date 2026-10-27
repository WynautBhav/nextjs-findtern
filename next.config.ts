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

  // ── Employer: mostly the same paths, different account type ──────────────
  { from: "/employer", to: "/employer/dashboard" },
  { from: "/employer/setup", to: "/employer/onboarding" },
  { from: "/employer/profile", to: "/employer/account" },
  { from: "/employer/account/change-password", to: "/employer/account" },
  { from: "/employer/notifications", to: "/employer/alerts" },
  { from: "/employer/intern/:id/proposal", to: "/employer/send-proposal?intern=:id" },
  // The legacy typo alias, which was live long enough to be linked.
  { from: "/employer/shedule", to: "/employer/schedule" },
  { from: "/employer/proposals/:id/edit", to: "/employer/proposal/:id?edit=1" },
  { from: "/employer/timesheet", to: "/employer/timesheets" },
  { from: "/employer/interns", to: "/employer/candidates" },
  { from: "/guaranteed-program", to: "/guaranteed-internship-program" },
  { from: "/intern/onboarding-loading", to: "/intern/onboarding" },

  { from: "/employer/proposals/:id", to: "/employer/proposal/:id" },
  { from: "/intern/login", to: "/login" },
  { from: "/intern/signup", to: "/signup" },
  { from: "/intern/edit-profile", to: "/intern/onboarding" },
  { from: "/intern/dashboard/documents", to: "/intern/documents" },

  // ── Admin: legacy aliases ────────────────────────────────────────────────
  { from: "/admin", to: "/admin/dashboard" },
  { from: "/admin/contact", to: "/admin/messages" },
  { from: "/admin/website", to: "/admin/cms" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    return [
      // The legacy admin "reconnect Meet calendar" links (SYS-12). Both start
      // the Findtern calendar connect; the admin proxy signs a non-admin in
      // first.
      { source: "/auth/google/callback/auth", destination: "/api/admin/google/connect", permanent: false },
      { source: "/google/auth", destination: "/api/admin/google/connect", permanent: false },
      // `/opportunities` is deliberately absent: it is a real route now (the
      // public browser), and it keeps the one legacy URL that should survive.
      ...LEGACY_REDIRECTS.map((r) => ({
        source: r.from,
        destination: r.to,
        permanent: true,
      })),
    ];
  },
  async rewrites() {
    return [
      // Files the legacy app stored as /uploads/...; served with access checks.
      { source: "/uploads/:path*", destination: "/api/files/legacy/:path*" },
      // The Google redirect URI already registered for the live site.
      { source: "/auth/google/callback", destination: "/api/auth/google/callback" },
      // Findtern calendar connect (Meet links), the legacy registered URI.
      { source: "/google/callback", destination: "/api/admin/google/callback" },
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
          { key: "Permissions-Policy", value: "camera=*, microphone=*, geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;