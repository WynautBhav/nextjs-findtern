import { Pager } from "@/components/admin/pagination";
import { Section } from "@/components/app/stat";
import { Ledger } from "@/components/admin/money/ledger";
import { NameLink, Said, SortLinks, windowWords } from "@/components/admin/money/rp-parts";
import { ExportLink, SearchForm, SelectField } from "@/components/admin/reports/filter-bar";
import { COMPANY_PAGE_SIZE, parseCompanyFilter } from "@/lib/admin/reports/employers";
import { loadCompanies } from "@/lib/admin/reports/employers-load";
import { reportHref } from "@/lib/admin/reports/href";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

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
const n = (v: number) => (v === 0 ? <span className="text-ink-600">none</span> : formatNumber(v));

/** The per-company table: projects (now), proposals / interviews / hires / money (in the window). Search, sort, status filter, 25 a page, CSV. */
export default async function Companies({ window: w, params }: TabProps) {
  const f = parseCompanyFilter(params);
  const { rows, total } = await loadCompanies(f, w);
  const pages = Math.max(1, Math.ceil(total / COMPANY_PAGE_SIZE));
  const active = Boolean(f.q || f.status);
  const keep = ["range", "period", "from", "to", "cq", "cstatus", "csort", "cdir"];
  const csv = `/api/admin/reports/employers?${new URLSearchParams(Object.entries(params).filter(([k, v]) => v && keep.includes(k))).toString()}`;
  const sortHref = (key: string) => reportHref(params, { csort: key, cdir: f.sort === key && f.dir === "desc" ? "asc" : "desc" }, ["cpage"]);
  const win = windowWords(w);

  return (
    <Section
      title={`Companies (${formatNumber(total)})`}
      hint={`Projects are as they are now. Proposals, interviews, hires and money are for ${win}. Projects: all (live / paused / closed). Expired: ran out of time, +Nw = also N withdrawn by the employer. Paid is gross of refunds, in rupees (a dollar order counts as ₹100 per $1), with the latest order's payment mode under it.`}
      action={<ExportLink href={csv} label="Export the filtered companies as CSV" />}
    >
      <div id="company-table" className="scroll-mt-4" data-rp="employers-companies">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <SearchForm params={params} name="cq" label="Search companies" placeholder="Company, email, city" drop={["cpage"]}>
            <SelectField name="cstatus" label="Show" value={f.status} options={STATUS_OPTIONS} />
          </SearchForm>
        </div>
        <div className="mb-3">
          <SortLinks label="Sort companies" items={SORTS.map(([label, key]) => ({ label, href: sortHref(key), active: f.sort === key, dir: f.dir }))} />
        </div>
        <Ledger
          caption="Companies"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Said>{active ? "No company fits these filters. Clear the search or the filter." : "No companies yet. They appear as soon as an employer signs up."}</Said>}
          columns={[
            { key: "c", header: "Company", primary: true, cell: (r) => <NameLink href={`/admin/companies/${r.id}`} sub={[r.city, r.state, r.country && r.country !== "India" ? r.country : null].filter(Boolean).join(", ") || r.email}>{r.name}</NameLink> },
            { key: "p", header: "Projects", align: "right", cell: (r) => (r.projects === 0 ? <span className="text-ink-600">none</span> : `${r.projects} (${r.live} / ${r.paused} / ${r.closed})`), className: "whitespace-nowrap" },
            { key: "s", header: "Sent", align: "right", cell: (r) => n(r.sent) },
            { key: "a", header: "Accepted", align: "right", cell: (r) => n(r.accepted) },
            { key: "r", header: "Rejected", align: "right", cell: (r) => n(r.rejected) },
            { key: "e", header: "Pending", align: "right", cell: (r) => n(r.pending) },
            { key: "x", header: "Expired", align: "right", cell: (r) => (r.withdrawn ? `${formatNumber(r.expired)} +${formatNumber(r.withdrawn)}w` : n(r.expired)) },
            { key: "i", header: "Interviews", align: "right", cell: (r) => n(r.interviews) },
            { key: "h", header: "Hires", align: "right", cell: (r) => n(r.hires) },
            {
              key: "m",
              header: "Paid",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.paidMinor > 0 ? (
                  <span className="block">
                    {formatMoney(r.paidMinor, "INR")}
                    {r.mode ? <span className="block text-xs text-ink-600">{MODE[r.mode] ?? r.mode}</span> : null}
                  </span>
                ) : (
                  <span className="text-ink-600">none</span>
                ),
            },
            { key: "j", header: "Joined", align: "right", cell: (r) => formatDate(r.joined), className: "whitespace-nowrap" },
          ]}
        />
        <Pager page={Math.min(f.page, pages)} pages={pages} total={total} perPage={COMPANY_PAGE_SIZE} rowsShown={rows.length} params={params} basePath="/admin/reports" noun="companies" pageKey="cpage" />
      </div>
    </Section>
  );
}
