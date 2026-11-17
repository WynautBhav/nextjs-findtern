import Link from "next/link";

import { IdentityCell } from "@/components/admin/data-table";
import { Pager } from "@/components/admin/pagination";
import { Panel, PanelHeader } from "@/components/admin/panel";
import { ExportLink, SearchForm, SelectField } from "@/components/admin/reports/filter-bar";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { COMPANY_PAGE_SIZE, parseCompanyFilter } from "@/lib/admin/reports/employers";
import { loadCompanies } from "@/lib/admin/reports/employers-load";
import { reportHref } from "@/lib/admin/reports/href";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TabProps } from "../types";

const STATUS_OPTIONS = [
  { value: "", label: "All companies" },
  { value: "live", label: "Has a live project" },
  { value: "paused", label: "Has a paused project" },
  { value: "none", label: "No projects" },
  { value: "hired", label: "Hired someone" },
];
const SORTS: [string, string][] = [["Newest", "joined"], ["Name", "name"], ["Projects", "projects"], ["Proposals", "sent"], ["Hires", "hires"], ["Paid", "paid"]];
const MODE: Record<string, string> = { upfront: "Upfront", monthly: "Monthly", hiring_fee: "Fee first", total: "Upfront" };

/** The per-company table: projects (now), proposals / interviews / hires / money (in the window). Search, sort, status filter, 25 a page, CSV. */
export default async function Companies({ window: w, params }: TabProps) {
  const f = parseCompanyFilter(params);
  const { rows, total } = await loadCompanies(f, w);
  const pages = Math.max(1, Math.ceil(total / COMPANY_PAGE_SIZE));
  const active = Boolean(f.q || f.status);
  const keep = ["range", "period", "from", "to", "cq", "cstatus", "csort", "cdir"];
  const csv = `/api/admin/reports/employers?${new URLSearchParams(Object.entries(params).filter(([k, v]) => v && keep.includes(k))).toString()}`;
  const sortHref = (key: string) => reportHref(params, { csort: key, cdir: f.sort === key && f.dir === "desc" ? "asc" : "desc" }, ["cpage"]);
  const win = w.kind === "all" ? "all time" : w.label.toLowerCase();

  return (
    <Panel data-rp="employers-companies" id="company-table" className="scroll-mt-4">
      <PanelHeader
        title={`Companies (${formatNumber(total)})`}
        description={`Projects are as they are now. Proposals, interviews, hires and money are for ${win}. Under each company: its city and state. Projects: all (live / paused / closed). Sent: proposals sent. Expired: ran out of time (+Nw: also N withdrawn by the employer). Paid is gross of refunds, in rupees (a dollar order counts as ₹100 per $1) with the latest order's payment mode under it.`}
        action={<ExportLink href={csv} label="Export the filtered companies as CSV" />}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] py-3.5">
        <SearchForm params={params} name="cq" label="Search companies" placeholder="Company, email, city" drop={["cpage"]}>
          <SelectField name="cstatus" label="Show" value={f.status} options={STATUS_OPTIONS} />
        </SearchForm>
        <nav aria-label="Sort companies" className="ml-auto flex flex-wrap gap-1 text-sm">
          {SORTS.map(([label, key]) => (
            <Link key={key} href={sortHref(key)} scroll={false} aria-current={f.sort === key ? "true" : undefined} className={cn("rounded-full px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11", f.sort === key ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "bg-[color:var(--admin-panel-2)] text-foreground hover:bg-[color:var(--admin-bar-tint)]")}>
              {label}
              {f.sort === key ? <span aria-hidden> {f.dir === "asc" ? "\u2191" : "\u2193"}</span> : null}
              {f.sort === key ? <span className="sr-only">, sorted {f.dir === "asc" ? "ascending" : "descending"}</span> : null}
            </Link>
          ))}
        </nav>
      </div>
      <SimpleTable
        caption="Companies"
        compact
        minWidth=""
        maxHeight="max-h-none"
        head={["Company", "Projects", "Sent", "Accepted", "Rejected", "Pending", "Expired", "Interviews", "Hires", "Paid", "Joined"]}
        right={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
        nowrap={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
        rows={rows.map((r) => [
          <IdentityCell key="n" name={r.name} id={r.id} sub={[r.city, r.state, r.country && r.country !== "India" ? r.country : null].filter(Boolean).join(", ") || r.email} href={`/admin/companies/${r.id}`} size="sm" />,
          `${r.projects} (${r.live} / ${r.paused} / ${r.closed})`,
          formatNumber(r.sent),
          formatNumber(r.accepted),
          formatNumber(r.rejected),
          formatNumber(r.pending),
          r.withdrawn ? `${formatNumber(r.expired)} +${formatNumber(r.withdrawn)}w` : formatNumber(r.expired),
          formatNumber(r.interviews),
          formatNumber(r.hires),
          r.paidMinor > 0 ? (
            <span key="p" className="block">
              {formatMoney(r.paidMinor, "INR")}
              {r.mode ? <span className="block text-xs text-text-subtle">{MODE[r.mode] ?? r.mode}</span> : null}
            </span>
          ) : (
            "-"
          ),
          formatDate(r.joined),
        ])}
        empty={active ? { title: "No company matches", body: "No company fits these filters. Clear the search or the filter." } : { title: "No companies yet", body: "Companies appear here as soon as an employer signs up." }}
      />
      <Pager page={Math.min(f.page, pages)} pages={pages} total={total} perPage={COMPANY_PAGE_SIZE} rowsShown={rows.length} params={params} basePath="/admin/reports" noun="companies" pageKey="cpage" />
    </Panel>
  );
}
