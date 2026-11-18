import { Pager } from "@/components/admin/pagination";
import { Section } from "@/components/app/stat";
import { Ledger } from "@/components/admin/money/ledger";
import { Said, SortLinks, NameLink } from "@/components/admin/money/rp-parts";
import { ExportLink, SearchForm, SelectField } from "@/components/admin/reports/filter-bar";
import { reportHref } from "@/lib/admin/reports/href";
import { bandLabel, bandOf, BANDS, INTERN_PAGE_SIZE, internStage, parseInternFilter, skillNames, STAGE_LABEL } from "@/lib/admin/reports/interns";
import { loadInternTable } from "@/lib/admin/reports/interns-load";
import { formatDate, formatNumber } from "@/lib/format";
import Link from "next/link";

import type { TabProps } from "../types";

const STATUS_OPTIONS = [
  ["", "Any status"], ["active", "Active"], ["hidden", "Hidden by admin"], ["banned", "Banned"],
  ["hired", "Hired"], ["unhired", "Not hired"], ["paid", "Paid activation"], ["unpaid", "Not paid"], ["scored", "AI scored"], ["unscored", "Not scored"],
].map(([value, label]) => ({ value, label }));

const SORTS: [string, string][] = [["Intern", "name"], ["City", "city"], ["Score", "score"], ["Joined", "joined"], ["Last active", "active"]];

const stage = (r: Awaited<ReturnType<typeof loadInternTable>>["rows"][number]) =>
  STAGE_LABEL[internStage({ profileStarted: r.started, profileComplete: r.complete, feePaid: r.paid, scored: r.score != null, applied: r.applied, hired: r.hired })];

/** The searchable, filterable, paginated intern table (25 a page) with a CSV of the same filter. */
export default async function InternTable({ params }: TabProps) {
  const f = parseInternFilter(params);
  const { rows, total } = await loadInternTable(f);
  const pages = Math.max(1, Math.ceil(total / INTERN_PAGE_SIZE));
  const active = [f.q, f.city, f.skill, f.status, f.band].some(Boolean);
  const csv = `/api/admin/reports/interns?${new URLSearchParams(Object.entries(params).filter(([k, v]) => v && ["range", "period", "from", "to", "iq", "icity", "iskill", "istatus", "iband", "isort", "idir"].includes(k))).toString()}`;
  const here = (patch: Record<string, string>, reset: string[] = ["ipage"]) => reportHref(params, patch, reset);
  const sortHref = (key: string) => here({ isort: key, idir: f.sort === key && f.dir === "desc" ? "asc" : "desc" });

  return (
    <Section
      title={`Interns (${formatNumber(total)})`}
      hint="Search by name, email, city, college or skill. Open an intern for the full 360 view."
      action={<ExportLink href={csv} label="Export the filtered interns as CSV" />}
      className="scroll-mt-4"
    >
      <div id="intern-table" className="scroll-mt-4" data-rp="interns-table">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <SearchForm params={params} name="iq" label="Search interns" placeholder="Name, email, city, college, skill" drop={["ipage"]}>
            <SelectField name="istatus" label="Status" value={f.status} options={STATUS_OPTIONS} />
            <SelectField name="iband" label="Score band" value={f.band} options={[{ value: "", label: "Any band" }, ...BANDS.map((b) => ({ value: b, label: bandLabel(b) }))]} />
          </SearchForm>
          {f.city ? <Chip label={`City: ${f.city}`} clear={here({ icity: "" })} /> : null}
          {f.skill ? <Chip label={`Skill: ${f.skill}`} clear={here({ iskill: "" })} /> : null}
        </div>
        <div className="mb-3">
          <SortLinks label="Sort interns" items={SORTS.map(([label, key]) => ({ label, href: sortHref(key), active: f.sort === key, dir: f.dir }))} />
        </div>
        <Ledger
          caption="Interns"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Said>{active ? "No intern fits these filters. Clear a filter or search for something else." : "No interns yet. They appear as soon as they sign up."}</Said>}
          columns={[
            { key: "n", header: "Intern", primary: true, cell: (r) => <NameLink href={`/admin/interns/${r.id}`} sub={r.email}>{r.name}</NameLink> },
            { key: "c", header: "City", cell: (r) => [r.city, r.state].filter(Boolean).join(", ") || "–" },
            { key: "k", header: "College", cell: (r) => r.college ?? "–" },
            {
              key: "s",
              header: "Skills",
              cell: (r) => {
                const skills = skillNames(r.skills);
                return skills.length ? `${skills.slice(0, 3).join(", ")}${skills.length > 3 ? ` +${skills.length - 3}` : ""}` : "–";
              },
            },
            { key: "x", header: "Score", align: "right", cell: (r) => (r.score == null ? "–" : `${r.score.toFixed(1)} · ${bandLabel(bandOf(r.score))}`) },
            {
              key: "g",
              header: "Stage",
              cell: (r) => (
                <span>
                  {stage(r)}
                  {r.status !== "active" ? <span className="block text-xs font-medium text-ink-900">{r.status === "banned" ? "Banned" : r.status === "hidden" ? "Hidden by admin" : "Switched off"}</span> : null}
                </span>
              ),
            },
            { key: "j", header: "Joined", align: "right", cell: (r) => formatDate(r.createdAt) },
            { key: "a", header: "Last active", align: "right", cell: (r) => (r.lastSeen ? formatDate(r.lastSeen) : "–") },
          ]}
        />
        <Pager page={Math.min(f.page, pages)} pages={pages} total={total} perPage={INTERN_PAGE_SIZE} rowsShown={rows.length} params={params} basePath="/admin/reports" noun="interns" pageKey="ipage" />
      </div>
    </Section>
  );
}

function Chip({ label, clear }: { label: string; clear: string }) {
  return (
    <Link href={clear} scroll={false} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-ink-300 px-3 text-sm font-medium text-ink-900 hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11">
      {label}
      <span aria-hidden>&times;</span>
      <span className="sr-only">Remove this filter</span>
    </Link>
  );
}
