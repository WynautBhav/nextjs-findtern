import Link from "next/link";

import { EmptyScene, PageHead, Pill, Surface, pillTabClass, type Tone } from "@/components/app/primitives";
import { RosterRemove } from "@/components/college/roster-remove";
import { RosterImport } from "@/components/college/roster-import";
import { CopyText } from "@/components/college/copy-text";
import { approvalsFor } from "@/lib/college/approvals";
import { yearLabel } from "@/lib/college/labels";
import { requireCollegeContext, rosterCoverage, type RosterListRow } from "@/lib/college/scope";
import { requirePublicOrigin } from "@/lib/origin";

const PAGE_SIZE = 50;
/** Name · phone · email · year, branch · status · remove (stacks on a phone). */
const GRID = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.2fr)_7.5rem_minmax(0,1.5fr)_minmax(0,0.9fr)_8.5rem_5.5rem]";

type Show = "all" | RosterListRow["state"];
const TABS: { key: Show; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "not_joined", label: "Not joined yet" },
  { key: "on_findtern", label: "Waiting for you" },
  { key: "joined", label: "Joined" },
];
const STATE: Record<RosterListRow["state"], { label: string; tone: Tone }> = {
  joined: { label: "Joined", tone: "paid" },
  on_findtern: { label: "Waiting for you", tone: "waiting" },
  not_joined: { label: "Not joined", tone: "closed" },
};

export const dynamic = "force-dynamic";

/**
 * The college's own student list (name, phone, email) and where each student stands: joined, on Findtern but not
 * yet accepted, or not signed up. This is the list the placement office used to send to Findtern; they keep it here.
 */
export default async function RosterPage({ searchParams }: { searchParams?: Promise<{ page?: string; show?: string }> }) {
  const ctx = await requireCollegeContext();
  const sp = await searchParams;
  const { candidates } = await approvalsFor(ctx.college.id, ctx.college.emailDomains);
  const coverage = await rosterCoverage(ctx.college.id, new Set(candidates.map((c) => c.email.toLowerCase())));
  const show: Show = TABS.find((t) => t.key === sp?.show)?.key ?? "all";
  const count = (k: Show) => (k === "all" ? coverage.rows.length : coverage.rows.filter((r) => r.state === k).length);
  const list = show === "all" ? coverage.rows : coverage.rows.filter((r) => r.state === show);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp?.page ?? "1", 10) || 1));
  const shown = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const href = (p: number, s: Show = show) => `?${new URLSearchParams({ ...(s !== "all" ? { show: s } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  const origin = requirePublicOrigin();
  const invite = [
    `Hi,`,
    ``,
    `${ctx.college.name} has partnered with Findtern for placements. Create your free account, take the AI interview, and you'll be visible to employers in our virtual campus drives.`,
    ``,
    `1. Sign up at ${origin}/signup.`,
    ctx.college.code ? `2. Choose "College account" and enter our college code: ${ctx.college.code}` : `2. Choose "College account" and enter the college code from the placement office.`,
    `3. Take the AI interview from your dashboard.`,
    ``,
    `Training & Placement Cell`,
  ].join("\n");
  const notJoined = coverage.rows.filter((r) => r.state === "not_joined");
  const waiting = count("on_findtern");

  return (
    <div className="space-y-6">
      <PageHead
        title="Student list"
        lede={
          coverage.rosterSize
            ? `${coverage.joined} of ${coverage.rosterSize} students on your list have joined Findtern.`
            : "Add your students once. Findtern shows you who has joined, who already had an account, and who still needs a reminder."
        }
      />

      {coverage.rosterSize > 0 ? (
        <details className="group rounded-apple-xl border border-ink-200/80 bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-sm font-semibold text-ink-900 hover:bg-ink-50">
            Add or update students
            <span aria-hidden className="font-medium text-brand-700 group-open:hidden">Open</span>
          </summary>
          <div className="border-t border-ink-100 p-5">
            <RosterImport />
          </div>
        </details>
      ) : (
        <Surface className="p-5">
          <RosterImport />
        </Surface>
      )}

      {waiting > 0 ? (
        <p className="rounded-apple-sm border border-accent-300/70 bg-accent-100/60 px-4 py-3 text-sm text-ink-800">
          <span className="nums font-semibold">{waiting}</span> {waiting === 1 ? "student on your list already has" : "students on your list already have"} a Findtern account and can be added now.{" "}
          <Link href="/college/approvals" className="font-semibold text-brand-800 underline underline-offset-2">Review and accept them</Link>
        </p>
      ) : null}

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
          <nav aria-label="Filter the list" className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <Link key={t.key} href={href(1, t.key)} aria-current={show === t.key ? "page" : undefined} className={pillTabClass(show === t.key)}>
                {t.label}
                <span className={`nums text-xs ${show === t.key ? "text-white/75" : "text-text-subtle"}`}>{count(t.key)}</span>
              </Link>
            ))}
          </nav>
          {notJoined.length > 0 ? (
            <span className="flex flex-wrap gap-2">
              <CopyText text={invite} label="Copy invite message" />
              <CopyText text={notJoined.map((s) => s.email).join(", ")} label={`Copy ${notJoined.length} emails`} />
            </span>
          ) : null}
        </div>

        {shown.length === 0 ? (
          coverage.rosterSize === 0 ? (
            <EmptyScene compact title="No student list yet" body="Once you add your list, every student shows here with where they stand, so you know exactly who to remind." who="You - add the list above" />
          ) : (
            <EmptyScene compact title="Nobody in this group" body="No student on your list is in this group right now. Choose Everyone to see the whole list." />
          )
        ) : (
          <div>
            <div aria-hidden className={`${GRID} hidden gap-x-4 border-b border-ink-100 px-5 py-2.5 text-xs font-medium text-text-subtle md:grid`}>
              <span>Name</span>
              <span>Phone</span>
              <span>Email</span>
              <span>Year, branch</span>
              <span>Status</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-ink-100">
              {shown.map((s) => (
                <li key={s.email} className={`${GRID} grid items-center gap-x-4 gap-y-0.5 px-5 py-2 text-sm`}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-900">{s.name || "—"}</span>
                    {s.rollNo ? <span className="nums block text-xs text-text-subtle">{s.rollNo}</span> : null}
                  </span>
                  <span className="nums text-ink-700 max-md:hidden">{s.phone ?? "—"}</span>
                  <span className="break-all text-ink-600 max-md:order-3 max-md:col-span-2">
                    {s.email}
                    {s.phone ? <span className="nums md:hidden"> · {s.phone}</span> : null}
                  </span>
                  <span className="text-ink-700 max-md:hidden">{[s.year ? yearLabel(s.year) : null, s.branch].filter(Boolean).join(", ") || "—"}</span>
                  <span className="max-md:justify-self-end"><Pill tone={STATE[s.state].tone}>{STATE[s.state].label}</Pill></span>
                  <span className="max-md:order-4 max-md:col-span-2 md:justify-self-end">
                    <RosterRemove email={s.email} name={s.name} />
                  </span>
                </li>
              ))}
            </ul>
            {pages > 1 ? (
              <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 text-sm">
                <span className="nums text-text-subtle">Page {page} of {pages} · {list.length.toLocaleString("en-IN")} students</span>
                <span className="flex gap-4 font-medium text-brand-700">
                  {page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-11 items-center rounded-full px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Previous</Link> : null}
                  {page < pages ? <Link href={href(page + 1)} className="inline-flex min-h-11 items-center rounded-full px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Next</Link> : null}
                </span>
              </nav>
            ) : null}
          </div>
        )}
      </Surface>
    </div>
  );
}
