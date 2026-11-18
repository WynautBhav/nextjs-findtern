import { Section } from "@/components/app/stat";
import { Ledger } from "@/components/admin/money/ledger";
import { Said } from "@/components/admin/money/rp-parts";
import { BANDS, bandLabel } from "@/lib/admin/reports/interns";
import { loadSkillSupply } from "@/lib/admin/reports/interns-load";
import { formatNumber } from "@/lib/format";

const cell = (n: number) => (n === 0 ? <span className="text-ink-600">none</span> : formatNumber(n));

/** Top skills by interns, with the Espresso / Cappuccino / Latte split by AI interview score. */
export default async function Skills() {
  const s = await loadSkillSupply();
  const scored = s.bands.espresso + s.bands.cappuccino + s.bands.latte;
  return (
    <Section title="Skills and score bands" hint={`Interns per skill (top 15), by AI interview score: Espresso below 6, Cappuccino 6 to below 8, Latte 8 and up. ${formatNumber(scored)} interns are scored, ${formatNumber(s.bands.unscored)} are not.`}>
      <Ledger
        caption="Skills with score bands"
        rows={s.skills}
        rowKey={(r) => r.skill}
        empty={<Said>No skills yet. They appear once interns pick them on their profile.</Said>}
        columns={[
          { key: "k", header: "Skill", primary: true, cell: (r) => r.skill },
          { key: "t", header: "Interns", align: "right", cell: (r) => formatNumber(r.total) },
          ...(["espresso", "cappuccino", "latte", "unscored"] as const).map((b) => ({ key: b, header: bandLabel(b), align: "right" as const, cell: (r: (typeof s.skills)[number]) => cell(r[b]) })),
        ]}
      />
      <p className="nums mt-3 text-sm text-ink-700">All interns: {BANDS.map((b) => `${bandLabel(b)} ${formatNumber(s.bands[b])}`).join(" · ")}</p>
    </Section>
  );
}
