"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { EmptyScene, Pill, type Tone } from "@/components/app/primitives";
import { DataTable } from "@/components/app/data-table";
import { Section, StatList } from "@/components/app/stat";
import { Meter } from "@/components/college/meter";
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
const FIELD = "h-10 rounded-md border border-ink-300 bg-surface-raised px-3 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 max-lg:h-11";

/**
 * Slot and code progress for a paid drive order. `liveDrive` says a drive is
 * open right now: with no order then, this block stays out of the way instead
 * of announcing "not set up" under a banner that says the drive is live.
 */
export function DriveDashboard({ liveDrive = false }: { liveDrive?: boolean }) {
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
    return <p role="alert" className="text-sm text-danger">Could not load your drive slots. Refresh to try again.</p>;
  }
  if (!data) {
    return (
      <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ink-200/60 motion-reduce:animate-none">
        <span className="sr-only">Loading drive slots…</span>
      </div>
    );
  }
  const { totals } = data.metrics;
  if (data.metrics.orders.length === 0) {
    if (liveDrive) return null;
    return (
      <Section title="Drive slots">
        <p className="max-w-xl text-sm text-ink-700">
          Slots and codes appear here once a drive order is paid.{" "}
          <Link href="/college/drives/new" className="font-semibold text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700">
            Set up a drive
          </Link>
        </p>
      </Section>
    );
  }
  const done = data.metrics.orders.reduce((a, o) => a + (o.interviews.completed ?? 0), 0);
  const pages = Math.max(1, Math.ceil(data.students.total / PAGE_SIZE));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Not yet");

  return (
    <div className="space-y-8">
      <Section title="Drive slots" hint={`${totals.redeemed} of ${totals.slots} slots activated`}>
        <div className="grid items-start gap-x-14 gap-y-6 lg:grid-cols-2">
          <div>
            <Meter value={totals.redeemed} max={totals.slots} label="Activated share of slots" />
            <p className="nums mt-2 text-sm text-ink-700">
              {totals.pending} code{totals.pending === 1 ? "" : "s"} sent, not yet used · {totals.unused} unused
            </p>
          </div>
          <StatList
            items={[
              { label: "Slots", value: totals.slots.toLocaleString("en-IN") },
              { label: "Codes sent", value: totals.issued.toLocaleString("en-IN") },
              { label: "Activated", value: totals.redeemed.toLocaleString("en-IN") },
              { label: "Interviews done", value: done.toLocaleString("en-IN") },
            ]}
          />
        </div>
      </Section>

      <Section title="Students in this drive">
        <div className="mb-3 flex flex-wrap gap-2">
          <label htmlFor="drive-search" className="sr-only">Search students by name or email</label>
          <input
            id="drive-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            maxLength={80}
            className={`${FIELD} min-w-0 flex-1`}
          />
          <label htmlFor="drive-status" className="sr-only">Filter by status</label>
          <select
            id="drive-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={FIELD}
          >
            <option value="">All statuses</option>
            {DRIVE_STATUSES.map((s) => (
              <option key={s} value={s}>{DRIVE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        {error ? <p className="mb-2 text-sm text-danger" role="alert">Could not refresh. Showing the last results.</p> : null}
        <DataTable
          caption="Student drive status"
          rows={data.students.rows}
          rowKey={(r) => r.id}
          empty={
            term || status ? (
              <EmptyScene compact title="No students match" body="No student fits this search and status. Clear the search or choose All statuses to see everyone." />
            ) : (
              <EmptyScene compact title="No students in this drive yet" body="Students appear here once your roster is confirmed. You can then share their codes." who="Findtern - uploads and confirms your roster" />
            )
          }
          columns={[
            {
              key: "student",
              header: "Student",
              primary: true,
              cell: (r) => (
                <>
                  <span className="block font-medium text-ink-900">{r.name}</span>
                  <span className="block break-all text-xs font-normal text-ink-600">{r.email}</span>
                </>
              ),
            },
            { key: "status", header: "Status", cell: (r) => <Pill tone={TONE[r.status]}>{DRIVE_STATUS_LABEL[r.status]}</Pill> },
            { key: "at", header: "Activated", align: "right", cell: (r) => when(r.activatedAt) },
          ]}
        />
        {data.students.total > PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-between text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="min-h-11 min-w-11 px-3 font-medium text-brand-800 underline underline-offset-4 disabled:no-underline disabled:opacity-40">Previous</button>
            <span aria-live="polite" className="nums text-ink-600">Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="min-h-11 min-w-11 px-3 font-medium text-brand-800 underline underline-offset-4 disabled:no-underline disabled:opacity-40">Next</button>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
