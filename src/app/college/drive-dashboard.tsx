"use client";

import { useEffect, useState } from "react";

import { EmptyScene, Pill, Surface, type Tone } from "@/components/app/primitives";
import { DRIVE_STATUSES, DRIVE_STATUS_LABEL, type DriveStatus } from "@/lib/college/drive-dashboard";

type Metrics = {
  orders: { id: string; slots: number; issued: number; redeemed: number; pending: number; unused: number; interviews: Record<string, number> }[];
  totals: { slots: number; issued: number; redeemed: number; pending: number; unused: number };
  rosterValid: number;
};
type Row = { id: string; name: string; email: string; status: DriveStatus; activatedAt: string | null };
type Data = { metrics: Metrics; students: { rows: Row[]; total: number; page: number; pageSize: number } };

const TONE: Record<DriveStatus, Tone> = {
  not_invited: "closed",
  code_sent: "waiting",
  activated: "new",
  interview_started: "live",
  interview_completed: "paid",
};
const PAGE_SIZE = 20;

export function DriveDashboard() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const ctl = new AbortController();
    const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (term) sp.set("q", term);
    if (status) sp.set("status", status);
    fetch(`/api/college/drive-dashboard?${sp}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(new Error("bad"))))
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError(true);
      });
    return () => ctl.abort();
  }, [page, term, status]);

  if (error && !data) {
    return <Surface className="p-5" role="alert"><p className="text-sm">Could not load your drive dashboard. Refresh to try again.</p></Surface>;
  }
  if (!data) {
    return <Surface className="min-h-[28rem] p-5" aria-busy="true"><p className="text-sm text-text-subtle">Loading drive dashboard…</p></Surface>;
  }
  const { totals } = data.metrics;
  if (data.metrics.orders.length === 0) {
    return (
      <Surface>
        <EmptyScene
          compact
          title="Your drive is not set up yet"
          body="A drive starts once its order is paid. After that, your slots, codes and student progress show here."
          who="Findtern - sets up your drive once the order is paid"
        />
      </Surface>
    );
  }
  const done = data.metrics.orders.reduce((a, o) => a + (o.interviews.completed ?? 0), 0);
  const pct = totals.slots ? Math.round((totals.redeemed / totals.slots) * 100) : 0;
  const cards = [
    ["Slots", totals.slots],
    ["Codes sent", totals.issued],
    ["Activated", totals.redeemed],
    ["Interviews done", done],
  ] as const;
  const pages = Math.max(1, Math.ceil(data.students.total / PAGE_SIZE));

  return (
    <section aria-label="Drive dashboard" className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, v]) => (
          <Surface key={label} className="p-4">
            <p className="text-sm text-text-subtle">{label}</p>
            <p className="nums text-3xl font-semibold">{v.toLocaleString("en-IN")}</p>
          </Surface>
        ))}
      </div>
      <Surface className="p-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% of slots activated`} aria-label="Activated share of slots">
          <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="nums mt-2 text-sm text-text-subtle">
          {pct}% · {totals.redeemed} of {totals.slots} slots activated · {totals.pending} code{totals.pending === 1 ? "" : "s"} sent, not yet used · {totals.unused} unused
        </p>
      </Surface>
      <Surface className="p-4">
        <div className="flex flex-wrap gap-2">
          <label htmlFor="drive-search" className="sr-only">Search students by name or email</label>
          <input
            id="drive-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
                        maxLength={80}
            className="h-11 min-w-0 flex-1 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <label htmlFor="drive-status" className="sr-only">Filter by status</label>
          <select
            id="drive-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-md border px-2 text-sm"
          >
            <option value="">All statuses</option>
            {DRIVE_STATUSES.map((s) => (
              <option key={s} value={s}>{DRIVE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700" role="alert">Could not refresh. Showing the last results.</p> : null}
        {data.students.total === 0 ? (
          term || status ? (
            <EmptyScene
              compact
              title="No students match"
              body="No student fits this search and status. Clear the search or choose All statuses to see everyone."
            />
          ) : (
            <EmptyScene
              compact
              title="No students in this drive yet"
              body="Students appear here once your roster is confirmed. You can then share their codes."
              who="Findtern - uploads and confirms your roster"
            />
          )
        ) : (
          <>
          <ul className="mt-3 space-y-2 md:hidden" aria-label="Student drive status">
            {data.students.rows.map((r) => (
              <li key={r.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{r.name}</p>
                <p className="break-all text-text-subtle">{r.email}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2"><span className="text-text-subtle">Status:</span><Pill tone={TONE[r.status]}>{DRIVE_STATUS_LABEL[r.status]}</Pill></p>
                <p className="nums text-text-subtle">Activated: {r.activatedAt ? new Date(r.activatedAt).toLocaleDateString("en-IN") : "Not yet"}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[22rem] text-sm">
              <caption className="sr-only">Student drive status</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="py-2 pr-3">Student</th>
                  <th scope="col" className="px-2">Status</th>
                  <th scope="col" className="pl-2">Activated</th>
                </tr>
              </thead>
              <tbody>
                {data.students.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-3"><span className="block font-medium">{r.name}</span><span className="text-text-subtle">{r.email}</span></td>
                    <td className="px-2"><Pill tone={TONE[r.status]}>{DRIVE_STATUS_LABEL[r.status]}</Pill></td>
                    <td className="nums pl-2">{r.activatedAt ? new Date(r.activatedAt).toLocaleDateString("en-IN") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="mt-3 flex items-center justify-between text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="min-h-11 min-w-11 px-3 underline disabled:no-underline disabled:opacity-40">Previous</button>
          <span aria-live="polite" className="nums">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="min-h-11 min-w-11 px-3 underline disabled:no-underline disabled:opacity-40">Next</button>
        </div>
      </Surface>
    </section>
  );
}
