import Link from "next/link";

import { EmptyScene, PageHead } from "@/components/app/primitives";
import { DataTable } from "@/components/app/data-table";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { RosterRemove } from "@/components/college/roster-remove";
import { RosterImport } from "@/components/college/roster-import";
import { CopyText } from "@/components/college/copy-text";
import { yearLabel } from "@/lib/college/labels";
import { requireCollegeContext, rosterCoverage } from "@/lib/college/scope";
import { requirePublicOrigin } from "@/lib/origin";

const PAGE_SIZE = 50;

export const dynamic = "force-dynamic";

export default async function RosterPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const ctx = await requireCollegeContext();
  const coverage = await rosterCoverage(ctx.college.id);
  const pages = Math.max(1, Math.ceil(coverage.notJoined.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt((await searchParams)?.page ?? "1", 10) || 1));
  const shown = coverage.notJoined.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const origin = requirePublicOrigin();
  const invite = [
    `Hi,`,
    ``,
    `${ctx.college.name} has partnered with Findtern for placements. Create your free account, take the AI interview, and you'll be visible to employers in our virtual placement drives.`,
    ``,
    `1. Sign up at ${origin}/signup${ctx.college.emailDomains.length ? ` with your college email (@${ctx.college.emailDomains[0]})` : ""}.`,
    `2. Under College, choose "${ctx.college.name}" and agree to share your progress with the placement cell.`,
    `3. Take the AI interview from your dashboard.`,
    ``,
    `Training & Placement Cell`,
  ].join("\n");
  const claimedNote =
    coverage.claimed > 0
      ? `${coverage.claimed} student${coverage.claimed === 1 ? " has" : "s have"} picked your college but ${coverage.claimed === 1 ? "isn't" : "aren't"} on this list or using a college email. Share your student code with them to verify them.`
      : null;
  const hasList = coverage.rosterSize > 0;
  const pct = hasList ? Math.round((coverage.joined / coverage.rosterSize) * 100) : 0;
  const pre = "max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-ink-200 bg-surface-raised p-3 font-sans text-sm leading-relaxed text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-700";
  const summary = "min-h-10 cursor-pointer py-2 text-sm font-semibold text-brand-800";

  return (
    <div className="space-y-8">
      <PageHead title="Roster" lede={hasList ? undefined : "Upload your student list to see who hasn't joined yet."} />

      {hasList ? (
        <Overview
          lead={
            <LeadStat
              label="On your roster who have joined"
              value={<>{coverage.joined}<span className="text-2xl text-ink-600"> of {coverage.rosterSize}</span></>}
              note={coverage.notJoined.length ? `${pct}% joined. ${coverage.notJoined.length} still to join: copy their emails or the invite below.` : "Everyone on your roster has joined."}
            />
          }
          rest={
            coverage.claimed > 0 ? <StatList items={[{ label: "Joined but not on this list", value: coverage.claimed }]} /> : undefined
          }
        />
      ) : null}

      {hasList ? (
        <Section title="Invite and update" hint="Send the invite on your class groups or by email, or upload a new list.">
          <div className="flex flex-wrap items-center gap-3">
            <CopyText text={invite} label="Copy invite message" />
          </div>
          <details className="mt-2 max-w-2xl">
            <summary className={summary}>See the invite message</summary>
            <pre tabIndex={0} aria-label="Invite message" className={pre}>{invite}</pre>
          </details>
          <details className="max-w-2xl">
            <summary className={summary}>Upload a new list</summary>
            <div className="pt-2"><RosterImport /></div>
          </details>
          {claimedNote ? <p className="mt-2 max-w-2xl text-sm text-ink-700">{claimedNote}</p> : null}
        </Section>
      ) : (
        <div className="grid gap-x-14 gap-y-8 lg:grid-cols-2">
          <Section title="Upload student list" hint="Students on the list get their year and branch filled in when they join.">
            <RosterImport />
          </Section>
          <Section title="Invite message" hint="Send it on your class groups or by email.">
            <div className="space-y-3">
              <pre tabIndex={0} aria-label="Invite message" className={pre}>{invite}</pre>
              <CopyText text={invite} label="Copy message" />
              {claimedNote ? <p className="text-sm text-ink-700">{claimedNote}</p> : null}
            </div>
          </Section>
        </div>
      )}

      <Section
        title={`Not joined yet${coverage.notJoined.length ? ` (${coverage.notJoined.length})` : ""}`}
        hint="On your roster, no Findtern account with that email."
        action={coverage.notJoined.length ? <CopyText text={coverage.notJoined.map((s) => s.email).join(", ")} label="Copy emails" /> : undefined}
      >
        <DataTable
          caption="Roster students who have not joined"
          rows={shown}
          rowKey={(s) => s.email}
          empty={
            hasList ? (
              <p className="py-2 text-sm text-ink-700">Everyone on your roster has joined.</p>
            ) : (
              <EmptyScene compact title="No student list yet" body="Once you upload your list, the students who have not joined Findtern appear here so you can remind them." who="You - upload the list above" />
            )
          }
          columns={[
            { key: "name", header: "Name", primary: true, cell: (s) => s.name || "—" },
            { key: "roll", header: "Roll no.", cell: (s) => s.rollNo || "—" },
            { key: "year", header: "Year", cell: (s) => (s.year ? yearLabel(s.year) : "—") },
            { key: "branch", header: "Branch", cell: (s) => s.branch || "—" },
            { key: "email", header: "Email", cell: (s) => <span className="break-all text-ink-700">{s.email}</span> },
            { key: "act", header: "Actions", align: "right", cell: (s) => <RosterRemove email={s.email} name={s.name} /> },
          ]}
        />
        {pages > 1 ? (
          <nav aria-label="Pagination" className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="nums text-ink-600">Page {page} of {pages} · {coverage.notJoined.length.toLocaleString("en-IN")} not joined</span>
            <span className="flex gap-2 font-medium text-brand-800">
              {page > 1 ? <Link href={`?page=${page - 1}`} className="inline-flex min-h-11 items-center px-3 underline underline-offset-4">Previous</Link> : null}
              {page < pages ? <Link href={`?page=${page + 1}`} className="inline-flex min-h-11 items-center px-3 underline underline-offset-4">Next</Link> : null}
            </span>
          </nav>
        ) : null}
      </Section>
    </div>
  );
}
