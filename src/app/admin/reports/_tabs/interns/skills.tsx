import { Panel, PanelHeader } from "@/components/admin/panel";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { BANDS, bandLabel } from "@/lib/admin/reports/interns";
import { loadSkillSupply } from "@/lib/admin/reports/interns-load";
import { formatNumber } from "@/lib/format";

/** Top skills by interns, with the Espresso / Cappuccino / Latte split by AI interview score. */
export default async function Skills() {
  const s = await loadSkillSupply();
  const scored = s.bands.espresso + s.bands.cappuccino + s.bands.latte;
  return (
    <Panel>
      <PanelHeader
        title="Skills and score bands"
        description={`Interns per skill (top 15), split by AI interview score: Espresso below 6, Cappuccino 6 to below 8, Latte 8 and up. ${formatNumber(scored)} interns are scored, ${formatNumber(s.bands.unscored)} are not.`}
      />
      <SimpleTable
        caption="Skills with score bands"
        head={["Skill", "Interns", ...BANDS.map(bandLabel)]}
        right={[1, 2, 3, 4, 5]}
        minWidth="lg:min-w-[30rem]"
        rows={s.skills.map((r) => [r.skill, formatNumber(r.total), formatNumber(r.espresso), formatNumber(r.cappuccino), formatNumber(r.latte), formatNumber(r.unscored)])}
        empty={{ title: "No skills yet", body: "Skills appear here once interns pick them on their profile." }}
      />
      <p className="nums px-[var(--admin-pad-panel)] pb-4 pt-2 text-sm text-text-subtle">
        All interns: {BANDS.map((b) => `${bandLabel(b)} ${formatNumber(s.bands[b])}`).join(" · ")}
      </p>
    </Panel>
  );
}
