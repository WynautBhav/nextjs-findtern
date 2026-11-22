import { Mail, Phone } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import type { CameEmployer, Invite } from "@/lib/college/drive-board";
import { shortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Employer alert: the companies the officer invited against those who came in through the link. Who has not come
 * is listed first with their email, so the officer can chase them; who came is listed with the contact to call.
 */
export function EmployerAlert({ invited, arrived, missing, came, over = false }: { invited: Invite[]; arrived: Invite[]; missing: Invite[]; came: CameEmployer[]; over?: boolean }) {
  const expected = invited.length;
  return (
    <section aria-labelledby="employer-alert" className={cn("overflow-hidden", SURFACE_CLASS)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink-100 px-5 py-4">
        <h2 id="employer-alert" className="text-base font-semibold text-ink-900">
          Employers
        </h2>
        <p className="nums text-sm text-ink-700">
          {expected ? (
            <>
              <span className={cn("font-semibold", missing.length ? "text-accent-700" : "text-brand-700")}>{arrived.length} of {expected}</span> invited companies came
              {came.length > arrived.length ? ` · ${came.length - arrived.length} more joined on their own` : ""}
            </>
          ) : (
            <>{came.length} {came.length === 1 ? "company" : "companies"} came · add the companies you invited to see who is missing</>
          )}
        </p>
      </header>

      {missing.length > 0 ? (
        <div className="border-b border-ink-100 bg-accent-100/60 px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-900">{over ? "Didn't come" : "Not here yet"}: {missing.length}</h3>
          <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {missing.map((m) => (
              <li key={m.email} className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-ink-900">{m.company}</span>
                <a href={`mailto:${m.email}`} className="inline-flex shrink-0 items-center gap-1.5 text-ink-700 hover:text-brand-700">
                  <Mail className="size-3.5 text-ink-400" aria-hidden />
                  {m.email}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {came.length === 0 ? (
        <p className="px-5 py-6 text-sm text-text-subtle">{over ? "No company came in through this drive." : "Nobody has come in yet. Companies appear here as they open your link while signed in."}</p>
      ) : (
        <>
        {/* Phone: one block per company, the number first-class (it is what the officer chases with). */}
        <ul className="divide-y divide-ink-100 sm:hidden">
          {came.map((c) => (
            <li key={c.employerId} className="space-y-1 px-5 py-3 text-sm">
              <p className="font-medium text-ink-900">{c.company ?? "Employer"}</p>
              <p className="text-ink-700">{[c.contact, c.employerId.slice(0, 8).toUpperCase()].filter(Boolean).join(" · ")}</p>
              {c.phone ? (
                <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="nums inline-flex min-h-9 items-center gap-1.5 text-ink-700 hover:text-brand-700">
                  <Phone className="size-3.5 text-ink-400" aria-hidden />
                  {c.phone}
                </a>
              ) : null}
              {c.email ? <p className="text-xs text-text-subtle">{c.email}</p> : null}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="nums w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-text-subtle">
                <th scope="col" className="px-5 py-2.5 font-medium">Company</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Contact</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Phone</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Employer ID</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Came in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 border-t border-ink-100">
              {came.map((c) => (
                <tr key={c.employerId}>
                  <td className="px-5 py-3">
                    <span className="block font-medium text-ink-900">{c.company ?? "Employer"}</span>
                    {c.email ? <span className="block text-xs text-text-subtle">{c.email}</span> : null}
                  </td>
                  <td className="px-3 py-3 text-ink-700">{c.contact ?? "—"}</td>
                  <td className="px-3 py-3">
                    {c.phone ? (
                      <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 text-ink-700 hover:text-brand-700">
                        <Phone className="size-3.5 text-ink-400" aria-hidden />
                        {c.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs tracking-wide text-ink-600">{c.employerId.slice(0, 8).toUpperCase()}</td>
                  <td className="px-5 py-3 text-right text-ink-700">{shortDateTime(c.joinedAt, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  );
}
