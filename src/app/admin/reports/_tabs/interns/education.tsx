import { RankCard } from "@/components/admin/reports/rank-card";
import { loadEducation } from "@/lib/admin/reports/interns-load";
import { formatNumber } from "@/lib/format";

/** College, degree and graduation year, from the education step of the profile. */
export default async function Education() {
  const e = await loadEducation();
  const note = (missing: number) => `${formatNumber(missing)} of ${formatNumber(e.total)} interns have not given this.`;
  return (
    <RankCard
      title="Education"
      description="Where interns study (top 10 each; spelling and case folded)."
      empty="No intern has filled the education step yet."
      groups={[
        { title: "College", note: note(e.missing.college), rows: e.colleges.map((r) => ({ label: r.label, value: r.count })) },
        { title: "Degree", note: note(e.missing.degree), rows: e.degrees.map((r) => ({ label: r.label, value: r.count })) },
        { title: "Graduation year", note: note(e.missing.year), rows: e.years.map((r) => ({ label: r.label, value: r.count })) },
      ]}
    />
  );
}
