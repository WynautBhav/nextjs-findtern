import Link from "next/link";

import { EmptyScene, Surface } from "@/components/app/primitives";
import { HoursBars, type HoursMonth } from "@/components/intern/kit/hours-bars";
import { Lift } from "@/components/intern/kit/motion";
import { relativeDay } from "@/components/intern/home/relative-time";
import type { ThreadNode } from "@/lib/journey";

const LINK = "inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline";

export function ActivityCard({ thread, history, now, openToWork }: { thread: ThreadNode[]; history: ThreadNode[]; now: Date; openToWork: boolean }) {
  return (
    <Surface as="section" aria-labelledby="activity-title" className="p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="activity-title" className="text-base font-semibold text-ink-900">Activity</h2>
        {history.length > 0 ? <Link href="/intern/record" className={LINK}>Full record</Link> : null}
      </div>
      {thread.length === 0 ? (
        <EmptyScene
          title="No offers or interviews yet"
          body={
            openToWork
              ? "When a company books an interview or sends an offer, it lands here, then your timesheets and payments."
              : "Your profile is hidden, so no one can book an interview or send an offer. Switch on Open to work to be found."
          }
          next={openToWork ? { label: "See open roles", href: "/intern/opportunities" } : { label: "Open your profile", href: "/intern/profile" }}
          who={openToWork ? "Waiting on employers" : "Waiting on you"}
        />
      ) : history.length === 0 ? (
        <p className="mt-2 text-sm text-text-subtle">Nothing else yet.</p>
      ) : (
        <ol className="relative mt-3 ml-2 space-y-1 border-l border-ink-200 pl-5">
          {history.slice(0, 5).map((n) => {
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-pretty text-sm font-medium text-ink-900">{n.title}</span>
                  {n.with ? <span className="block text-sm text-text-subtle">with {n.with}</span> : null}
                </span>
                <span className="shrink-0 text-sm text-text-subtle">{relativeDay(n.at, now)}</span>
              </>
            );
            const row = "flex min-h-14 items-center gap-3 rounded-apple-sm px-2 py-2";
            return (
              <li key={n.id} className="relative">
                <span aria-hidden className="absolute -left-[26px] top-1/2 size-2 -translate-y-1/2 rounded-full bg-brand-600 ring-4 ring-white" />
                {n.href ? <Link href={n.href} className={`${row} transition-colors hover:bg-ink-50`}>{body}</Link> : <div className={row}>{body}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </Surface>
  );
}

export function OpenRolesCard({ roles }: { roles: { id: string; projectName: string; scopeOfWork: string | null }[] }) {
  return (
    <Surface as="section" aria-labelledby="roles-title" className="p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="roles-title" className="text-base font-semibold text-ink-900">Open roles</h2>
        <Link href="/intern/opportunities" className={LINK}>See all</Link>
      </div>
      <ul className="mt-1 grid gap-1">
        {roles.slice(0, 5).map((p) => (
          <li key={p.id}>
            <Lift>
              <Link href={`/intern/opportunities/${p.id}`} className="group block min-h-14 rounded-apple-sm px-2 py-3 transition-colors hover:bg-ink-50">
                <span className="block break-words text-sm font-medium text-ink-900 group-hover:text-brand-700">{p.projectName}</span>
                <span className="block truncate text-sm text-text-subtle">{p.scopeOfWork}</span>
              </Link>
            </Lift>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

export function MonthsCard({ months }: { months: HoursMonth[] }) {
  return (
    <Surface as="section" aria-labelledby="months-title" className="p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="months-title" className="text-base font-semibold text-ink-900">Hours by month</h2>
        <Link href="/intern/timesheets" className={LINK}>Timesheets</Link>
      </div>
      <HoursBars months={months} />
      <p className="mt-4 flex items-center gap-4 text-xs text-text-subtle">
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full bg-brand-600" />Approved</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-brand-600/30 [background-image:repeating-linear-gradient(135deg,rgba(22,107,84,0.7)_0_1px,transparent_1px_3px)]" />
          Waiting
        </span>
      </p>
    </Surface>
  );
}
