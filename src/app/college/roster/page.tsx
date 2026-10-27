import { AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { RosterImport } from "@/components/college/roster-import";
import { CopyText } from "@/components/college/copy-text";
import { yearLabel } from "@/lib/college/labels";
import { requireCollegeContext, rosterCoverage } from "@/lib/college/scope";

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
      <AdminPageHeader
        title="Roster"
        subtitle={
          coverage.rosterSize
            ? `${coverage.joined} of ${coverage.rosterSize} students on your roster have joined Findtern.`
            : "Upload your student list to see who hasn't joined yet."
        }
      />

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
            <pre tabIndex={0} aria-label="Invite message" className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[10px] border border-ink-200 bg-ink-50 p-3 font-sans text-[13px] leading-relaxed text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600">{invite}</pre>
            <CopyText text={invite} label="Copy message" />
            {coverage.claimed > 0 ? (
              <p className="text-[13px] text-text-subtle">
                {coverage.claimed} student{coverage.claimed === 1 ? " has" : "s have"} picked your college but {coverage.claimed === 1 ? "isn't" : "aren't"} on this list or using a college email. Add them to the roster to verify them.
              </p>
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title={`Not joined yet (${coverage.notJoined.length})`}
          description="On your roster, no Findtern account with that email."
          action={coverage.notJoined.length ? <CopyText text={coverage.notJoined.map((s) => s.email).join(", ")} label="Copy emails" /> : undefined}
        />
        {coverage.notJoined.length === 0 ? (
          <PanelBody>
            <p className="text-[14px] text-text-subtle">{coverage.rosterSize ? "Everyone on your roster has joined." : "No roster uploaded yet."}</p>
          </PanelBody>
        ) : (
          <ul className="divide-y divide-ink-100">
            {coverage.notJoined.map((s) => (
              <li key={s.email} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{s.name || s.email}</p>
                  <p className="text-[13px] text-text-subtle">{[s.rollNo, s.year ? yearLabel(s.year) : null, s.branch].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="truncate text-[13px] text-ink-600">{s.email}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
