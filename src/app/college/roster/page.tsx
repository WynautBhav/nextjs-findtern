import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { PageHead, Surface } from "@/components/app/primitives";
import { RosterImport } from "@/components/college/roster-import";
import { CopyText } from "@/components/college/copy-text";
import { yearLabel } from "@/lib/college/labels";
import { requireCollegeContext, rosterCoverage } from "@/lib/college/scope";

/** Name · roll · year · branch · email (stacks on a phone). */
const ROSTER_GRID = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.3fr)_6rem_5.5rem_minmax(0,0.8fr)_minmax(0,1.5fr)]";

export const dynamic = "force-dynamic";

export default async function RosterPage() {
  const ctx = await requireCollegeContext();
  const coverage = await rosterCoverage(ctx.college.id);
  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
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

  return (
    <div className="space-y-6">
      <PageHead
        title="Roster"
        lede={
          coverage.rosterSize
            ? `${coverage.joined} of ${coverage.rosterSize} students on your roster have joined Findtern.`
            : "Upload your student list to see who hasn't joined yet."
        }
      />

      {coverage.rosterSize > 0 ? (
        // Once there is a list the page is about who hasn't joined: upload and
        // the invite fold into one row instead of two half-empty cards.
        <Surface className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink-900">Keep the list current</p>
            <CopyText text={invite} label="Copy invite message" />
          </div>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">See the invite message</summary>
            <div className="mt-3"><pre tabIndex={0} aria-label="Invite message" className="max-h-64 overflow-auto whitespace-pre-wrap rounded-apple-sm border border-ink-200 bg-ink-50 p-3 font-sans text-sm leading-relaxed text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600">{invite}</pre></div>
          </details>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Upload a new list</summary>
            <div className="mt-3">
              <RosterImport />
            </div>
          </details>
            {coverage.claimed > 0 ? (
              <p className="text-sm text-text-subtle">
                {coverage.claimed} student{coverage.claimed === 1 ? " has" : "s have"} picked your college but {coverage.claimed === 1 ? "isn't" : "aren't"} on this list or using a college email. Add them to the roster to verify them.
              </p>
            ) : null}
        </Surface>
      ) : (
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Upload student list" description="Students on the list are marked verified when they join." />
          <PanelBody>
            <RosterImport />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Invite message" description="Send it on your class groups or by email." />
          <PanelBody className="space-y-3">
            <pre tabIndex={0} aria-label="Invite message" className="max-h-64 overflow-auto whitespace-pre-wrap rounded-apple-sm border border-ink-200 bg-ink-50 p-3 font-sans text-sm leading-relaxed text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600">{invite}</pre>
            <CopyText text={invite} label="Copy message" />
            {coverage.claimed > 0 ? (
              <p className="text-sm text-text-subtle">
                {coverage.claimed} student{coverage.claimed === 1 ? " has" : "s have"} picked your college but {coverage.claimed === 1 ? "isn't" : "aren't"} on this list or using a college email. Add them to the roster to verify them.
              </p>
            ) : null}
          </PanelBody>
        </Panel>
      </div>
      )}

      <Panel>
        <PanelHeader
          title={`Not joined yet (${coverage.notJoined.length})`}
          description="On your roster, no Findtern account with that email."
          action={coverage.notJoined.length ? <CopyText text={coverage.notJoined.map((s) => s.email).join(", ")} label="Copy emails" /> : undefined}
        />
        {coverage.notJoined.length === 0 ? (
          <PanelBody>
            <p className="text-sm text-text-subtle">{coverage.rosterSize ? "Everyone on your roster has joined." : "No roster uploaded yet."}</p>
          </PanelBody>
        ) : (
          // A table of who to chase: name, roll, year, branch, email in aligned
          // columns (rows were 72px with the email pushed to the far right).
          // On a phone, two lines: name and roll, then year, branch and email
          // (five stacked lines made each student 150px tall, QA-160).
          <div>
            <div aria-hidden className={`${ROSTER_GRID} hidden gap-x-4 border-b border-ink-100 px-5 py-2.5 text-xs font-medium text-text-subtle sm:grid`}>
              <span>Name</span>
              <span>Roll no.</span>
              <span>Year</span>
              <span>Branch</span>
              <span>Email</span>
            </div>
            <ul className="divide-y divide-ink-100">
              {coverage.notJoined.map((s) => (
                <li key={s.email} className={`${ROSTER_GRID} grid items-baseline gap-x-4 gap-y-0.5 px-5 py-2.5 text-sm`}>
                  <span className="font-medium text-ink-900">{s.name || "—"}</span>
                  <span className="nums text-ink-700">{s.rollNo || "—"}</span>
                  <span className="text-ink-700 max-sm:hidden">{s.year ? yearLabel(s.year) : "—"}</span>
                  <span className="text-ink-700 max-sm:hidden">{s.branch || "—"}</span>
                  <span className="break-all text-ink-600 max-sm:col-span-2">
                    <span className="sm:hidden">{[s.year ? yearLabel(s.year) : null, s.branch].filter(Boolean).map((t) => `${t} · `).join("")}</span>
                    {s.email}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
