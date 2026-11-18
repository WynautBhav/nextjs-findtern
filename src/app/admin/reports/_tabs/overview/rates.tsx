import { and, count, eq, gte, lt } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { Section, StatList } from "@/components/app/stat";
import { countOrNone, LoadNote, windowWords } from "@/components/admin/money/rp-parts";
import { getDb, schema } from "@/lib/db";
import { reportHref } from "@/lib/admin/reports/href";
import { realEmployerId } from "@/lib/admin/scope";
import { formatNumber } from "@/lib/format";

import { loadAnalyticsOnce } from "./analytics-data";
import type { TabProps } from "../types";

const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "–");

/**
 * Rates and ratios, every one with the period and the people it is measured over written under it, so two figures
 * that share a word (hires, profile, interview) can never be mistaken for each other. Profile completion lives on the
 * "what new interns did next" list, not here.
 */
export default async function Rates({ window: w, params }: TabProps) {
  const since = w.since;
  const until = w.until;
  const inWindow = (col: AnyPgColumn) => and(since ? gte(col, since) : undefined, until ? lt(col, until) : undefined);
  const db = getDb();
  let loaded: Awaited<ReturnType<typeof loadAnalyticsOnce>> | null = null;
  let signups = 0;
  let interviews = 0;
  try {
    const [a, [s], [i]] = await Promise.all([
      loadAnalyticsOnce(since ? since.getTime() : null, until ? until.getTime() : null),
      db.select({ c: count() }).from(schema.users).where(and(eq(schema.users.role, "intern"), inWindow(schema.users.createdAt))),
      db.select({ c: count() }).from(schema.interviews).where(and(realEmployerId(schema.interviews.employerId), inWindow(schema.interviews.createdAt))),
    ]);
    loaded = a;
    signups = Number(s?.c ?? 0);
    interviews = Number(i?.c ?? 0);
  } catch (error) {
    console.error("[admin/reports/rates] load failed", error);
  }
  const label = windowWords(w);
  if (!loaded) {
    return (
      <Section title="Rates and ratios">
        <LoadNote what="the rates" retryHref={reportHref(params, {})} />
      </Section>
    );
  }
  const a = loaded;
  const t = a.totals;
  const r = a.rates;
  const rate = (v: number | null, suffix = "%") => (v == null ? "–" : `${v}${suffix}`);

  return (
    <Section title="Rates and ratios" hint={`Each line says what it counts and over which people and dates. Test employers are left out.`}>
      <div className="grid gap-x-12 xl:grid-cols-2">
      <StatList
        items={[
          { label: "Hires", value: countOrNone(t.hires), hint: `Hires dated ${label}: the employer paid for the hire (${formatNumber(t.hires - t.fullTimeHires)} internship, ${formatNumber(t.fullTimeHires)} full-time). Interns hired at any date are on the funnel list above.` },
          { label: "Average time to hire", value: r.avgHireTimeDays == null ? "–" : `${r.avgHireTimeDays} days`, hint: `Offer sent to employer paid, for the hires dated ${label}.` },
          { label: "Offer success", value: rate(r.successRate), hint: `Hires ÷ offers sent, both dated ${label}: ${formatNumber(t.hires)} of ${formatNumber(t.proposals)}. Drafts are not offers.` },
          { label: "Placement", value: rate(r.placementRate), hint: `Of the interns offered ${label}, the share who accepted or were hired. Accepted counts here even before the employer pays.` },
          { label: "Interviews booked per intern signup", value: pctOf(interviews, signups), hint: `${formatNumber(interviews)} interview bookings (pending and cancelled included) ÷ ${formatNumber(signups)} interns who signed up ${label}. A count of bookings, so it can pass 100%.` },
          { label: "Hires per interview booked", value: pctOf(t.hires, interviews), hint: `${formatNumber(t.hires)} hires ÷ ${formatNumber(interviews)} interview bookings, both dated ${label}.` },
        ]}
      />
      <StatList
        className="border-t-0 xl:border-t"
        items={[
          { label: "Offers per intern", value: rate(r.avgAppsPerUser, ""), hint: `${formatNumber(t.proposals)} offers sent ÷ ${formatNumber(t.signups)} interns who started a profile ${label}.` },
          { label: "Signup growth", value: r.monthlyGrowth == null ? "–" : `${r.monthlyGrowth}%`, hint: "Profiles started this period against the same-length period before." },
          { label: "Active employers", value: rate(r.activeEmployerRate), hint: `${formatNumber(t.activeEmployers)} companies posted a project or sent an offer ${label}, as a share of all companies.` },
          { label: "Repeat employers", value: rate(r.repeatEmployerRate), hint: `${formatNumber(t.repeatEmployers)} of those paid two or more orders ${label}.` },
          { label: "Open projects", value: rate(r.activeProjectRate), hint: `${formatNumber(t.activeProjects)} of the ${formatNumber(t.projects)} projects posted ${label} are still open.` },
          { label: "Projects per company", value: rate(r.projectsPerCompany, ""), hint: `${formatNumber(t.projects)} projects posted ${label} ÷ the ${formatNumber(t.companies)} companies that joined ${label}.` },
        ]}
      />
      </div>
    </Section>
  );
}
