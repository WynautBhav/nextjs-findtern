import { Section } from "@/components/app/stat";
import { RankGroup } from "@/components/admin/money/rp-bars";
import { loadEducation } from "@/lib/admin/reports/interns-load";
import { formatNumber } from "@/lib/format";

/** College, degree and graduation year, from the education step of the profile. */
export default async function Education() {
  const e = await loadEducation();
  const note = (missing: number) => `${formatNumber(missing)} of ${formatNumber(e.total)} interns have not given this.`;
  const empty = "No intern has filled the education step yet. It appears when they do.";
  return (
    <Section title="Education" hint="Where interns study (top 10 each; spelling and case folded).">
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        <RankGroup title="College" note={note(e.missing.college)} rows={e.colleges.map((r) => ({ label: r.label, value: r.count }))} unit="interns" ariaLabel="Interns by college" emptyText={empty} />
        <RankGroup title="Degree" note={note(e.missing.degree)} rows={e.degrees.map((r) => ({ label: r.label, value: r.count }))} unit="interns" ariaLabel="Interns by degree" emptyText={empty} />
        <RankGroup title="Graduation year" note={note(e.missing.year)} rows={e.years.map((r) => ({ label: r.label, value: r.count }))} unit="interns" ariaLabel="Interns by graduation year" emptyText={empty} />
      </div>
    </Section>
  );
}
