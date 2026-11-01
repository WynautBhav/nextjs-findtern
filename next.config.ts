import type { NextConfig } from "next";

/**
 * What a page may load, as a Content-Security-Policy (sent report-only for now).
 * Razorpay's checkout script and frame, Google Analytics / Tag Manager, the Meta
 * pixel and Vercel's own analytics are the third parties the pages use. Inline
 * scripts and styles are allowed because Next writes its hydration data inline;
 * a nonce-based policy is the next step.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://www.googletagmanager.com https://connect.facebook.net https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://vitals.vercel-insights.com",
  // Razorpay checkout; the Google map on /contact; Tag Manager's noscript frame; the Meta pixel's frame.
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.google.com https://www.googletagmanager.com https://www.facebook.com",
  "worker-src 'self'",
  // The Meta pixel submits a form to facebook.com/tr.
  "form-action 'self' https://www.facebook.com",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Where the browser sends what the policy would block (src/app/api/csp-report). Without it a
  // report-only policy collects nothing, and Safari ignores it.
  "report-uri /api/csp-report",
].join("; ");

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
  // Auth pages merged into one per step, with the account type in `?as=` (30 Oct).
  { from: "/employer/login", to: "/login?as=employer" },
  { from: "/employer/signup", to: "/signup?as=employer" },
  { from: "/employer/forgot-password", to: "/forgot-password?as=employer" },
  { from: "/employer/reset-password", to: "/reset-password?as=employer" },
  { from: "/employer/verify-email", to: "/verify-email?as=employer" },
  { from: "/college/login", to: "/login?as=college" },
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
          // Nothing here records from the camera or microphone (AI interviews run on an
          // external meeting link; the video inputs are file pickers), so neither is allowed.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HTTPS only, for a year, for this host. No includeSubDomains: every *.findtern.in
          // host would then have to serve HTTPS first, and that has not been checked.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Report-only first: it logs what the policy would block (browser console) without
          // blocking anything. Move to Content-Security-Policy once a full crawl is clean.
          { key: "Content-Security-Policy-Report-Only", value: CSP },
        ],
      },
      {
        // The push service worker must never be cached, or a fix never reaches phones.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;