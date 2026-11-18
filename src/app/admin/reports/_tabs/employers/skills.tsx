import { Section } from "@/components/app/stat";
import { Ledger } from "@/components/admin/money/ledger";
import { RankGroup } from "@/components/admin/money/rp-bars";
import { Said, windowWords } from "@/components/admin/money/rp-parts";
import { demandSupplyGap, SHORT_BELOW, SURPLUS_FROM } from "@/lib/admin/reports/employers";
import { loadHighestPaying, loadSkillDemand } from "@/lib/admin/reports/employers-load";
import { formatMoney, formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

const VERDICT = { short: "Short of interns", balanced: "Balanced", surplus: "Plenty of interns" } as const;

/** What employers ask for, how many interns have it, and what pays most. */
export default async function Skills({ window: w }: TabProps) {
  const [d, pay] = await Promise.all([loadSkillDemand(w), loadHighestPaying(w)]);
  const gap = demandSupplyGap(d.live, d.supply);
  const win = windowWords(w);
  const empty = "No project lists a skill yet. Skills appear when employers add them to a project.";

  return (
    <div className="space-y-10 lg:space-y-12" data-rp="employers-skills">
      <Section title="Skills employers ask for" hint="How many projects list each skill (top 20 each).">
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
          <RankGroup title="In live projects now" rows={d.live.map((r) => ({ label: r.label, value: r.count }))} unit="projects" ariaLabel="Skills in live projects" emptyText={empty} />
          <RankGroup title={`In projects posted ${win}`} rows={d.posted.map((r) => ({ label: r.label, value: r.count }))} unit="projects" ariaLabel="Skills in projects posted in the period" emptyText={empty} />
        </div>
      </Section>
      <Section title="Demand against supply" hint={`For each skill in live projects: interns who list it, per project asking. Under ${SHORT_BELOW} is short, ${SURPLUS_FROM} or more is plenty. Scarcest first.`}>
        <Ledger
          caption="Skill demand against intern supply"
          rows={gap}
          rowKey={(r) => r.skill}
          empty={<Said>No live demand: no published project lists a skill right now.</Said>}
          columns={[
            { key: "s", header: "Skill", primary: true, cell: (r) => r.skill },
            { key: "d", header: "Live projects asking", align: "right", cell: (r) => formatNumber(r.demand) },
            { key: "u", header: "Interns with it", align: "right", cell: (r) => formatNumber(r.supply) },
            { key: "p", header: "Interns per project", align: "right", cell: (r) => (r.perProject === null ? "none" : String(r.perProject)) },
            { key: "v", header: "Reading", cell: (r) => <span className={r.verdict === "short" ? "font-semibold" : undefined}>{VERDICT[r.verdict]}</span> },
          ]}
        />
      </Section>
      <Section title="Highest-paying skills" hint={`Average monthly offer in rupees on internship offers sent ${win}${pay.capped ? " (the latest 2,000 offers)" : ""}. ${formatNumber(pay.sampled)} offers read.`}>
        <RankGroup
          title="Average monthly offer"
          rows={pay.rows.map((r) => ({ label: r.skill, sub: `${r.offers} ${r.offers === 1 ? "offer" : "offers"}`, value: r.avgMonthlyMinor, display: formatMoney(r.avgMonthlyMinor, "INR") }))}
          unit="a month"
          maxLabel={pay.rows.length ? formatMoney(Math.max(...pay.rows.map((r) => r.avgMonthlyMinor)), "INR") : undefined}
          ariaLabel="Average monthly offer by skill"
          emptyText="No internship offer with a monthly amount in this period."
        />
      </Section>
    </div>
  );
}
