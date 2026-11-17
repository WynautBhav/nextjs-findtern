import { Panel, PanelHeader } from "@/components/admin/panel";
import { RankCard } from "@/components/admin/reports/rank-card";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { demandSupplyGap, SHORT_BELOW, SURPLUS_FROM } from "@/lib/admin/reports/employers";
import { loadHighestPaying, loadSkillDemand } from "@/lib/admin/reports/employers-load";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TabProps } from "../types";

const VERDICT = { short: "Short of interns", balanced: "Balanced", surplus: "Plenty of interns" } as const;
const TONE = { short: "bg-red-500/12 text-red-800 dark:text-red-300", balanced: "bg-[color:var(--admin-panel-2)] text-foreground", surplus: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300" } as const;

/** What employers ask for, how many interns have it, and what pays most. */
export default async function Skills({ window: w }: TabProps) {
  const [d, pay] = await Promise.all([loadSkillDemand(w), loadHighestPaying(w)]);
  const gap = demandSupplyGap(d.live, d.supply);
  const win = w.kind === "all" ? "all time" : w.label.toLowerCase();

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="employers-skills">
      <RankCard
        title="Skills employers ask for"
        description="How many projects list each skill (top 20 each)."
        empty="No project lists a skill yet."
        groups={[
          { title: "In live projects now", rows: d.live.map((r) => ({ label: r.label, value: r.count })) },
          { title: `In projects posted ${win}`, rows: d.posted.map((r) => ({ label: r.label, value: r.count })) },
        ]}
      />
      <Panel>
        <PanelHeader
          title="Demand against supply"
          description={`For each skill in live projects: interns who list it, per project asking. Under ${SHORT_BELOW} is short, ${SURPLUS_FROM} or more is plenty. Scarcest first.`}
        />
        <SimpleTable
          caption="Skill demand against intern supply"
          head={["Skill", "Live projects asking", "Interns with it", "Interns per project", "Reading"]}
          right={[1, 2, 3]}
          rows={gap.map((r) => [
            r.skill,
            formatNumber(r.demand),
            formatNumber(r.supply),
            r.perProject === null ? "none" : String(r.perProject),
            <span key="v" className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[r.verdict])}>{VERDICT[r.verdict]}</span>,
          ])}
          empty={{ title: "No live demand", body: "No published project lists a skill right now." }}
        />
      </Panel>
      <RankCard
        title="Highest-paying skills"
        description={`Average monthly offer in rupees on internship offers sent ${win}${pay.capped ? " (the latest 2,000 offers)" : ""}.`}
        empty="No internship offer with a monthly amount in this period."
        groups={[{ title: "Average monthly offer", note: `${formatNumber(pay.sampled)} offers read`, rows: pay.rows.map((r) => ({ label: `${r.skill} (${r.offers})`, value: r.avgMonthlyMinor, display: formatMoney(r.avgMonthlyMinor, "INR") })) }]}
      />
    </div>
  );
}
