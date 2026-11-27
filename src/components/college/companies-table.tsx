"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { ONLINE_WINDOW_MS } from "@/lib/college/constants";
import { istDateText } from "@/lib/college/ist";
import { ago } from "@/lib/college/labels";
import type { CompanyRow } from "@/lib/college/companies";
import { cn } from "@/lib/utils";

/** A company row with its dates as text, so it can cross from the server page to this client table. */
export type CompanyView = Omit<CompanyRow, "lastDriveAt" | "lastSeenAt"> & { lastDriveAt: string; lastSeenAt: string | null };

type Sort = "company" | "drives" | "lastDriveAt" | "meetings" | "offers" | "hires" | "lastSeenAt";
const NUMERIC = new Set<Sort>(["drives", "meetings", "offers", "hires"]);
const HEADS: { key: Sort | "contact" | "email" | "phone"; label: string; sort: boolean }[] = [
  { key: "company", label: "Company", sort: true },
  { key: "contact", label: "Contact person", sort: false },
  { key: "email", label: "Email", sort: false },
  { key: "phone", label: "Phone", sort: false },
  { key: "drives", label: "Drives", sort: true },
  { key: "lastDriveAt", label: "Last drive", sort: true },
  { key: "meetings", label: "Meets", sort: true },
  { key: "offers", label: "Offers", sort: true },
  { key: "hires", label: "Hires", sort: true },
  { key: "lastSeenAt", label: "Last seen", sort: true },
];
const PAGE = 100;
const field = "h-9 rounded-lg border border-ink-300 bg-card px-2.5 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

const dash = <span className="text-ink-400">-</span>;

function sortValue(r: CompanyView, k: Sort): string | number {
  if (k === "company") return r.company.toLowerCase();
  if (k === "lastDriveAt" || k === "lastSeenAt") return r[k] ? Date.parse(r[k]!) : 0;
  return r[k];
}

/**
 * Master data, Companies: every company that came to or was invited to the college's drives, to call again. Search, sort, and a
 * download of what is on screen (built on the server from the college's own drives: api/college/companies/export).
 */
export function CompaniesTable({ rows, now }: { rows: CompanyView[]; now: number }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"any" | "joined" | "invited">("any");
  const [sort, setSort] = useState<{ key: Sort; dir: "asc" | "desc" }>({ key: "lastDriveAt", dir: "desc" });
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const visible = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = rows.filter((r) => {
      if (status === "joined" && !r.joined) return false;
      if (status === "invited" && r.joined) return false;
      const hay = [r.company, r.contact, r.email, r.phone].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * dir || a.company.localeCompare(b.company);
    });
  }, [rows, q, status, sort]);

  const toggleSort = (key: Sort) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "company" ? "asc" : "desc" }));

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch("/api/college/companies/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: visible.map((r) => r.key) }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg(j?.error ?? "Download failed. Try again.");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `companies-${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}.csv`; // India date, whatever the browser's zone is
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`Downloaded ${visible.length} ${visible.length === 1 ? "company" : "companies"}.`);
    } catch {
      setMsg("Download failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const shown = visible.slice(0, limit);
  return (
    <section className="apple-admin rounded-apple-xl border border-ink-200/80 bg-card" aria-label="Companies">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-4">
        <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search companies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Company, contact or email" className={cn(field, "w-full pl-9")} />
        </label>
        <select aria-label="Which companies" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setLimit(PAGE); }} className={cn(field, status !== "any" && "border-brand-600 bg-brand-50 font-medium text-brand-900")}>
          <option value="any">All companies</option>
          <option value="joined">Took part</option>
          <option value="invited">Invited, did not join</option>
        </select>
        <p className="nums shrink-0 whitespace-nowrap px-1 text-sm text-ink-600" aria-live="polite">
          <span className="font-medium text-ink-900">{visible.length.toLocaleString("en-IN")}</span> of {rows.length.toLocaleString("en-IN")} companies
        </p>
        <button type="button" className={cn(buttonClass({ size: "sm" }), "ml-auto disabled:opacity-50")} onClick={download} disabled={busy || !visible.length}>
          <Download className="size-4" aria-hidden />
          {busy ? "Preparing…" : "Download CSV"}
        </button>
      </div>
      {msg ? <p className="border-b border-ink-100 px-4 py-2 text-sm text-ink-700" role="status">{msg}</p> : null}

      <div className="max-h-[70vh] overflow-auto">
        <table className="nums w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {HEADS.map((h, i) => {
                const k = h.key as Sort;
                const on = h.sort && sort.key === k;
                const right = h.sort && NUMERIC.has(k);
                return (
                  <th key={h.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("sticky top-0 z-10 border-b border-ink-200 bg-card px-4 py-2.5 text-xs font-normal text-ink-500", right ? "text-right" : "text-left", i === 0 && "left-0 z-20")}>
                    {h.sort ? (
                      <button type="button" onClick={() => toggleSort(k)} className={cn("inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500", on && "font-medium text-ink-900")}>
                        {h.label}
                        {on ? (sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null}
                      </button>
                    ) : (
                      h.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="group">
                <td className="sticky left-0 z-[1] whitespace-nowrap border-b border-ink-100 bg-card px-4 py-2.5 text-left group-hover:bg-ink-50">
                  <span className="font-medium text-ink-900">{r.company}</span>
                  {!r.joined ? <span className="ml-1.5 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">Invited, did not join</span> : null}
                </td>
                <td className="whitespace-nowrap border-b border-ink-100 px-4 py-2.5 text-left text-ink-700 group-hover:bg-ink-50">{r.contact ?? dash}</td>
                <td className="whitespace-nowrap border-b border-ink-100 px-4 py-2.5 text-left group-hover:bg-ink-50">
                  {r.email ? <a href={`mailto:${r.email}`} className="text-brand-700 hover:underline">{r.email}</a> : dash}
                </td>
                <td className="whitespace-nowrap border-b border-ink-100 px-4 py-2.5 text-left group-hover:bg-ink-50">
                  {r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="text-brand-700 hover:underline">{r.phone}</a> : dash}
                </td>
                <td className="whitespace-nowrap border-b border-ink-100 px-4 py-2.5 text-right text-ink-900 group-hover:bg-ink-50">{r.drives}</td>
                <td className="whitespace-nowrap border-b border-ink-100 px-4 py-2.5 text-left text-ink-700 group-hover:bg-ink-50">{istDateText(r.lastDriveAt)}</td>
                {[r.meetings, r.offers, r.hires].map((n, i) => (
                  <td key={i} className={cn("whitespace-nowrap border-b border-ink-100 px-4 py-2.5 text-right group-hover:bg-ink-50", n ? "text-ink-900" : "text-ink-400")}>{n}</td>
                ))}
                <td className="whitespace-nowrap border-b border-ink-100 px-4 py-2.5 text-left group-hover:bg-ink-50">
                  {!r.lastSeenAt ? dash : now - Date.parse(r.lastSeenAt) < ONLINE_WINDOW_MS ? <span className="font-medium text-[var(--color-positive,#247b50)]">Online</span> : <span className="text-ink-700">{ago(r.lastSeenAt, now)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? (
          <div className="px-4 py-10 text-center text-sm text-ink-600">
            {rows.length ? (
              <>
                No companies match.{" "}
                <button type="button" onClick={() => { setQ(""); setStatus("any"); }} className="font-medium text-brand-700 hover:underline">Clear search</button>
              </>
            ) : (
              "No companies yet. They appear here once they join one of your drives or you invite them."
            )}
          </div>
        ) : null}
      </div>
      {visible.length > limit ? (
        <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-sm text-ink-600">
          <span className="nums">Showing 1-{limit} of {visible.length.toLocaleString("en-IN")}. The download has all {visible.length.toLocaleString("en-IN")}.</span>
          <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more</button>
        </div>
      ) : null}
    </section>
  );
}
