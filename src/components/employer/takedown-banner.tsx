import { ShieldAlert } from "lucide-react";

import { ContactAdminButton } from "./contact-admin-button";

/**
 * Top-of-page banner for one or more projects Findtern took down. Renders nothing when there are none.
 * The owner may only view them and contact admin; every action on them is refused by the server as well.
 */
export function TakedownBanner({ projects }: { projects: { id: string; name: string; reason?: string | null }[] }) {
  if (projects.length === 0) return null;
  const first = projects[0];
  return (
    <section role="status" aria-label="Taken down by Findtern" className="rounded-apple-xl border border-danger/30 bg-danger-soft p-4 text-ink-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldAlert className="size-5 text-danger" aria-hidden /> Taken down by Findtern: view only</h2>
          {projects.length === 1 ? (
            <p className="break-words text-sm"><strong>{first.name}</strong> was taken down. You can view it but not change it.{first.reason ? <> Reason: <span className="whitespace-pre-line">{first.reason}</span></> : null}</p>
          ) : (
            <>
              <p className="text-sm">{projects.length} projects were taken down. You can view them but not change them.</p>
              <ul className="list-disc pl-5 text-sm">
                {projects.map((p) => <li key={p.id} className="break-words">{p.name}{p.reason ? <> — <span className="whitespace-pre-line">{p.reason}</span></> : null}</li>)}
              </ul>
            </>
          )}
        </div>
        <ContactAdminButton projectId={first.id} projectName={first.name} />
      </div>
    </section>
  );
}
