import Link from "next/link";

import { IdentityCell } from "@/components/admin/data-table";
import { Pager } from "@/components/admin/pagination";
import { Panel, PanelHeader } from "@/components/admin/panel";
import { ExportLink, SearchForm, SelectField } from "@/components/admin/reports/filter-bar";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { reportHref } from "@/lib/admin/reports/href";
import { bandLabel, bandOf, BANDS, INTERN_PAGE_SIZE, internStage, parseInternFilter, skillNames, STAGE_LABEL } from "@/lib/admin/reports/interns";
import { loadInternTable } from "@/lib/admin/reports/interns-load";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TabProps } from "../types";

const STATUS_OPTIONS = [
  ["", "Any status"], ["active", "Active"], ["hidden", "Hidden by admin"], ["banned", "Banned"],
  ["hired", "Hired"], ["unhired", "Not hired"], ["paid", "Paid activation"], ["unpaid", "Not paid"], ["scored", "AI scored"], ["unscored", "Not scored"],
].map(([value, label]) => ({ value, label }));

const SORT_HEAD: [string, string][] = [["Intern", "name"], ["City", "city"], ["College", ""], ["Skills", ""], ["Score", "score"], ["Stage", ""], ["Joined", "joined"], ["Last active", "active"]];

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
    <Panel id="intern-table" className="scroll-mt-4" data-rp="interns-table">
      <PanelHeader
        title={`Interns (${formatNumber(total)})`}
        description="Search by name, email, city, college or skill. Open an intern for the full 360 view."
        action={<ExportLink href={csv} label="Export the filtered interns as CSV" />}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] py-3.5">
        <SearchForm params={params} name="iq" label="Search interns" placeholder="Name, email, city, college, skill" drop={["ipage"]}>
          <SelectField name="istatus" label="Status" value={f.status} options={STATUS_OPTIONS} />
          <SelectField name="iband" label="Score band" value={f.band} options={[{ value: "", label: "Any band" }, ...BANDS.map((b) => ({ value: b, label: bandLabel(b) }))]} />
        </SearchForm>
        {f.city || f.skill ? (
          <div className="flex flex-wrap items-center gap-2">
            {f.city ? <Chip label={`City: ${f.city}`} clear={here({ icity: "" })} /> : null}
            {f.skill ? <Chip label={`Skill: ${f.skill}`} clear={here({ iskill: "" })} /> : null}
          </div>
        ) : null}
        <nav aria-label="Sort interns" className="ml-auto flex flex-wrap gap-1 text-sm">
          {SORT_HEAD.filter(([, k]) => k).map(([label, key]) => (
            <Link key={key} href={sortHref(key)} scroll={false} aria-current={f.sort === key ? "true" : undefined} className={cn("rounded-full px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11", f.sort === key ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "bg-[color:var(--admin-panel-2)] text-foreground hover:bg-[color:var(--admin-bar-tint)]")}>
              {label}
              {f.sort === key ? <span aria-hidden> {f.dir === "asc" ? "\u2191" : "\u2193"}</span> : null}
              {f.sort === key ? <span className="sr-only">, sorted {f.dir === "asc" ? "ascending" : "descending"}</span> : null}
            </Link>
          ))}
        </nav>
      </div>
      <SimpleTable
        caption="Interns"
        compact
        minWidth="lg:min-w-[52rem]"
        maxHeight="max-h-none"
        head={SORT_HEAD.map(([h]) => h)}
        right={[4]}
        nowrap={[4, 6, 7]}
        rows={rows.map((r) => {
          const skills = skillNames(r.skills);
          const stage = internStage({ profileStarted: r.started, profileComplete: r.complete, feePaid: r.paid, scored: r.score != null, applied: r.applied, hired: r.hired });
          return [
            <IdentityCell key="n" name={r.name} id={r.id} sub={r.email} href={`/admin/interns/${r.id}`} size="sm" />,
            [r.city, r.state].filter(Boolean).join(", ") || "-",
            r.college ?? "-",
            skills.length ? `${skills.slice(0, 3).join(", ")}${skills.length > 3 ? ` +${skills.length - 3}` : ""}` : "-",
            r.score == null ? "-" : `${r.score.toFixed(1)} \u00b7 ${bandLabel(bandOf(r.score))}`,
            <span key="s" className="flex flex-wrap items-center gap-1.5">
              {STAGE_LABEL[stage]}
              {r.status !== "active" ? <StatusBadge value={r.status === "banned" ? "rejected" : "paused"} label={r.status === "banned" ? "Banned" : r.status === "hidden" ? "Hidden" : "Inactive"} /> : null}
            </span>,
            formatDate(r.createdAt),
            r.lastSeen ? formatDate(r.lastSeen) : "-",
          ];
        })}
        empty={active ? { title: "No intern matches", body: "No intern fits these filters. Clear a filter or search for something else." } : { title: "No interns yet", body: "Interns appear here as soon as they sign up." }}
      />
      <Pager page={Math.min(f.page, pages)} pages={pages} total={total} perPage={INTERN_PAGE_SIZE} rowsShown={rows.length} params={params} basePath="/admin/reports" noun="interns" pageKey="ipage" />
    </Panel>
  );
}

function Chip({ label, clear }: { label: string; clear: string }) {
  return (
    <Link href={clear} scroll={false} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[color:var(--admin-bar-tint)] px-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11">
      {label}
      <span aria-hidden>&times;</span>
      <span className="sr-only">Remove this filter</span>
    </Link>
  );
}
