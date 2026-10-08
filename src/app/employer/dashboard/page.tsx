import type { Metadata } from "next";
import Link from "next/link";
import { eq, desc, and, count, sql } from "drizzle-orm";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileText,
  FolderKanban,
  FolderPlus,
  Plus,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { bandFor } from "@/lib/score";

export const metadata: Metadata = {
  title: "Employer Dashboard · Findtern",
  robots: { index: false, follow: false },
};

type ProjectRow = typeof schema.projects.$inferSelect;

export default async function EmployerDashboard() {
  const session = await getSession();
  const employerId = session!.uid;

  let projects: ProjectRow[] = [];
  let projectCount = 0;
  let activeProjectCount = 0;
  let proposalCount = 0;
  let acceptedCount = 0;
  let cartCount = 0;
  let recommendedCandidates: CandidateProfile[] = [];

  try {
    const db = getDb();

    // 1. Metrics & projects
    const [recentProjects, pCount, propCount, accCount, cCount] = await Promise.all([
      db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.employerId, employerId))
        .orderBy(desc(schema.projects.createdAt))
        .limit(4),
      db.$count(schema.projects, eq(schema.projects.employerId, employerId)),
      db.$count(schema.proposals, eq(schema.proposals.employerId, employerId)),
      db
        .select({ value: count() })
        .from(schema.proposals)
        .where(
          and(
            eq(schema.proposals.employerId, employerId),
            eq(schema.proposals.status, "accepted"),
          ),
        )
        .then((rows) => rows[0]?.value ?? 0),
      db
        .select({ value: count() })
        .from(schema.employerCartItems)
        .where(eq(schema.employerCartItems.employerId, employerId))
        .then((rows) => rows[0]?.value ?? 0),
    ]);

    projects = recentProjects;
    projectCount = pCount;
    proposalCount = propCount;
    acceptedCount = accCount;
    cartCount = cCount;
    activeProjectCount = projects.filter((p) => p.status === "active").length;

    // 2. Fetch top-scored recommended candidates
    const candidateRows = await db
      .select({
        user: schema.users,
        onboarding: schema.internOnboarding,
      })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.users.id, schema.internOnboarding.userId))
      .where(eq(schema.users.isActive, true))
      .orderBy(
        desc(
          sql`COALESCE((${schema.internOnboarding.extraData}->>'findternScore')::float8, 0)`,
        ),
      )
      .limit(4);

    recommendedCandidates = candidateRows.map((r) =>
      toCandidateProfile(r.user, r.onboarding),
    );
  } catch (err) {
    console.error("Failed to load employer dashboard:", err);
  }

  return (
    <div className="space-y-8">
      {/* Premium Hero Command Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-950 via-brand-900 to-teal-950 p-7 text-white shadow-sm border border-brand-800/60">
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-2xs font-semibold text-accent-300 border border-white/15 backdrop-blur-xs">
              <Sparkles className="size-3 text-accent-400" />
              <span>AI-Vetted Talent Marketplace</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Hiring Command Center
            </h1>
            <p className="text-xs text-on-dark-subtle leading-relaxed">
              Findtern candidates are pre-assessed across technical coding, communication, and problem-solving aptitude before reaching your interview desk.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/employer/candidates"
              className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-xs font-semibold text-brand-950 hover:bg-accent-400 transition-all shadow-xs active:scale-[0.99]"
            >
              <Users className="size-4" />
              <span>Explore Candidates</span>
            </Link>
            <Link
              href="/employer/projects"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition-all border border-white/15 backdrop-blur-xs"
            >
              <FolderPlus className="size-4" />
              <span>Create Project</span>
            </Link>
          </div>
        </div>

        {/* Subtle mesh background glows */}
        <div className="pointer-events-none absolute -bottom-16 -right-16 size-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -top-16 left-1/3 size-64 rounded-full bg-brand-500/10 blur-3xl" />
      </div>

      {/* Watermelon UI-grade 4 KPI Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Active Projects */}
        <Link
          href="/employer/projects"
          className="group relative overflow-hidden rounded-2xl border border-sand-300 bg-white p-5 shadow-2xs transition-all hover:border-brand-400 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-brand-600 opacity-90" />
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-text-subtle">
              Active Projects
            </span>
            <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-100 border border-brand-200/50">
              <FolderKanban className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
            {projectCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-2xs">
            <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
              {activeProjectCount} accepting
            </span>
            <span className="text-text-subtle flex items-center gap-0.5 group-hover:text-brand-700 transition-colors">
              Manage
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>

        {/* Shortlisted */}
        <Link
          href="/employer/cart"
          className="group relative overflow-hidden rounded-2xl border border-sand-300 bg-white p-5 shadow-2xs transition-all hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 opacity-90" />
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-text-subtle">
              Shortlisted
            </span>
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-700 transition-colors group-hover:bg-amber-100 border border-amber-200/50">
              <ShoppingBag className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
            {cartCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-2xs">
            <span className="font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
              In Candidate Cart
            </span>
            <span className="text-text-subtle flex items-center gap-0.5 group-hover:text-amber-700 transition-colors">
              View
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>

        {/* Proposals Sent */}
        <Link
          href="/employer/proposals"
          className="group relative overflow-hidden rounded-2xl border border-sand-300 bg-white p-5 shadow-2xs transition-all hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600 opacity-90" />
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-text-subtle">
              Proposals Sent
            </span>
            <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-700 transition-colors group-hover:bg-blue-100 border border-blue-200/50">
              <FileText className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
            {proposalCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-2xs">
            <span className="font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
              Offers In Flight
            </span>
            <span className="text-text-subtle flex items-center gap-0.5 group-hover:text-blue-700 transition-colors">
              Track
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>

        {/* Accepted Hires */}
        <Link
          href="/employer/orders"
          className="group relative overflow-hidden rounded-2xl border border-sand-300 bg-white p-5 shadow-2xs transition-all hover:border-emerald-400 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-600 opacity-90" />
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-text-subtle">
              Accepted Hires
            </span>
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-100 border border-emerald-200/50">
              <CheckCircle2 className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
            {acceptedCount}
          </p>
          <div className="mt-2 flex items-center justify-between text-2xs">
            <span className="font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
              Active Placements
            </span>
            <span className="text-text-subtle flex items-center gap-0.5 group-hover:text-emerald-700 transition-colors">
              Orders
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>
      </div>

      {/* Main Content Grid: Projects & Featured Talent */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left 2 Cols: Active Hiring Projects */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-ink-900">Active Hiring Projects</h2>
              <p className="text-xs text-text-subtle">Your open roles and matching candidate pipelines.</p>
            </div>
            <Link
              href="/employer/projects"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              <span>Manage all</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-sand-300 bg-sand-50/50 p-8 text-center">
              <Briefcase className="mx-auto size-8 text-ink-400" />
              <h3 className="mt-3 text-sm font-semibold text-ink-900">No projects created</h3>
              <p className="mt-1 text-xs text-text-subtle">
                Post an internship project to match with pre-vetted students automatically.
              </p>
              <Link
                href="/employer/projects"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800 shadow-sm"
              >
                <Plus className="size-3.5" />
                <span>Create First Project</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((p) => {
                const projectSkills = (p.skills as string[]) ?? [];
                const skillsHref =
                  projectSkills.length > 0
                    ? `/employer/candidates?skills=${encodeURIComponent(projectSkills.join(","))}`
                    : "/employer/candidates";

                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-2xl border border-sand-300 bg-white p-5 shadow-2xs transition-all hover:border-brand-300 hover:shadow-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-900 truncate">{p.projectName}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
                            p.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-sand-100 text-ink-600 border border-sand-200"
                          }`}
                        >
                          {p.status === "active" ? "Active" : "Closed"}
                        </span>
                      </div>
                      <p className="text-xs text-text-subtle truncate">
                        {p.scopeOfWork || "Standard Scope"} · <span className="capitalize">{p.locationType || "Remote"}</span>
                      </p>
                      {projectSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {projectSkills.slice(0, 4).map((s) => (
                            <span
                              key={s}
                              className="rounded-md bg-sand-100 px-2 py-0.5 text-2xs font-medium text-ink-700 border border-sand-200"
                            >
                              {s}
                            </span>
                          ))}
                          {projectSkills.length > 4 ? (
                            <span className="text-2xs text-text-subtle font-medium">
                              +{projectSkills.length - 4} more
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={skillsHref}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
                      >
                        <Users className="size-3.5" />
                        <span>Find Candidates</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Featured Candidates Rail */}
        <div className="space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-ink-900">Featured Candidates</h2>
            <p className="text-xs text-text-subtle">Top Findtern Score candidates ready for interview.</p>
          </div>

          <div className="space-y-3">
            {recommendedCandidates.map((c) => {
              const band = bandFor(c.score);
              return (
                <Link
                  key={c.id}
                  href={`/employer/intern/${encodeURIComponent(c.id)}`}
                  className="group block rounded-2xl border border-sand-300 bg-white p-4 shadow-2xs transition-all hover:border-brand-400 hover:shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-xs font-bold text-brand-800 border border-brand-200">
                        {c.initials}
                      </span>
                      <div className="min-w-0">
                        <h4 className="truncate text-xs font-semibold text-ink-900 group-hover:text-brand-700 transition-colors">
                          {c.fullName}
                        </h4>
                        <p className="truncate text-2xs text-text-subtle">
                          {c.location || "Remote candidate"}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-2xs font-bold text-brand-800 border border-brand-200" title={band.name}>
                        <Star className="size-3 fill-amber-500 text-amber-500" />
                        <span className="tabular-nums">{c.score.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  {c.skills.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {c.skills.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="rounded-md bg-sand-100 px-2 py-0.5 text-2xs text-ink-700 font-medium border border-sand-200/60"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              );
            })}

            <Link
              href="/employer/candidates"
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-sand-300 bg-sand-50/60 p-3 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition"
            >
              <span>Browse All Verified Candidates</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
