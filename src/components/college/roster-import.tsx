"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { yearLabel } from "@/lib/college/labels";
import { parseRoster } from "@/lib/college/roster";
import { cn } from "@/lib/utils";

const SAMPLE = "Name,Phone,Email,Roll No,Year,Branch\nAsha Sharma,9876543210,asha.sharma@college.edu.in,22CS014,3,CSE\nRavi Meena,9812345678,ravi.meena@college.edu.in,22EC031,3,ECE\n";
const PREVIEW_ROWS = 6;
const MAX_BYTES = 2_000_000;

/**
 * Add the college's student list: name, phone and email (roll number, year and branch if the sheet has them).
 * Nothing is saved until the officer has seen what Findtern read: the file is parsed in the browser with the same
 * parser the server uses (lib/college/roster.ts), shown as a preview with every skipped row named, and only then sent.
 */
export function RosterImport() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ imported: number; waiting: number } | null>(null);

  const parsed = useMemo(() => (text.trim() ? parseRoster(text) : null), [text]);
  const withPhone = parsed?.rows.filter((r) => r.phone).length ?? 0;

  async function take(f: File | undefined) {
    if (!f) return;
    setSaved(null);
    setProblem(null);
    if (/\.xlsx?$/i.test(f.name)) {
      setProblem("That is an Excel workbook. In Excel choose File, Save as, CSV and upload that file, or copy the rows and paste them here.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setProblem("That file is over 2 MB. Split it into smaller files and upload them one by one.");
      return;
    }
    setText(await f.text());
    setSource(f.name);
    setPasting(false);
  }

  function reset() {
    setText("");
    setSource(null);
    setProblem(null);
  }

  async function save() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    setProblem(null);
    const res = await csrfFetch("/api/college/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { imported?: number; waiting?: number; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !body) {
      setProblem(body?.error ?? "Could not save the list. Check your connection and try again.");
      return;
    }
    setSaved({ imported: body.imported ?? parsed.rows.length, waiting: body.waiting ?? 0 });
    reset();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite">
        {saved ? (
          <div className="rounded-apple-sm border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <p className="font-medium">Saved {saved.imported} {saved.imported === 1 ? "student" : "students"}.</p>
            {saved.waiting > 0 ? (
              <p className="mt-0.5">
                {saved.waiting} {saved.waiting === 1 ? "student already has" : "students already have"} a Findtern account.{" "}
                <Link href="/college/approvals" className="font-semibold underline underline-offset-2">Accept them</Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {problem ? <p role="alert" className="rounded-apple-sm border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{problem}</p> : null}

      {!parsed ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void take(e.dataTransfer.files?.[0]);
            }}
            className={cn("rounded-apple-md border border-dashed px-5 py-8 text-center", dragging ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-ink-50/50")}
          >
            <FileSpreadsheet className="mx-auto size-7 text-ink-500" aria-hidden />
            <p className="mt-3 text-[0.9375rem] font-semibold text-ink-900">Drop your student sheet here</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">
              A CSV with <strong>Name</strong>, <strong>Phone</strong> and <strong>Email</strong> columns. Roll number, year and branch are read too if they are there. The column order does not matter.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <input ref={file} id="roster-file" type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values,.txt" className="sr-only" onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />
              <label htmlFor="roster-file" className={cn(buttonClass({ size: "sm" }), "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600")}>
                <Upload aria-hidden /> Choose a file
              </label>
              <button type="button" onClick={() => setPasting((v) => !v)} aria-expanded={pasting} className={buttonClass({ size: "sm", variant: "outline" })}>
                Paste from Excel or Sheets
              </button>
              <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} download="findtern-student-list-sample.csv" className={buttonClass({ size: "sm", variant: "link" })}>
                Download a sample
              </a>
            </div>
          </div>
          {pasting ? (
            <label className="block text-sm font-medium text-ink-800">
              Copy the rows in Excel or Google Sheets, header row included, and paste them here
              <textarea
                autoFocus
                onChange={(e) => {
                  if (e.target.value.includes("\n")) {
                    setSaved(null);
                    setText(e.target.value);
                    setSource("Pasted rows");
                  }
                }}
                placeholder={"Name\tPhone\tEmail\nAsha Sharma\t9876543210\tasha.sharma@college.edu.in"}
                className="mt-2 min-h-32 w-full rounded-apple-sm border border-ink-200 bg-white px-3 py-2.5 font-mono text-sm font-normal text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          ) : null}
        </>
      ) : (
        <div className="rounded-apple-md border border-ink-200">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <div>
              <p className="text-[0.9375rem] font-semibold text-ink-900">
                <span className="nums">{parsed.rows.length}</span> {parsed.rows.length === 1 ? "student" : "students"} ready to save
              </p>
              <p className="mt-0.5 text-sm text-text-subtle">
                {source}
                {parsed.rows.length ? <> · <span className="nums">{withPhone}</span> with a phone number</> : null}
                {parsed.errors.length ? <> · <span className="nums font-medium text-accent-700">{parsed.errors.length}</span> {parsed.errors.length === 1 ? "row needs" : "rows need"} a look</> : null}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={reset} disabled={busy} className={buttonClass({ size: "sm", variant: "outline" })}>Choose another</button>
              <button type="button" onClick={save} disabled={busy || parsed.rows.length === 0} className={buttonClass({ size: "sm" })}>
                {busy ? "Saving…" : `Save ${parsed.rows.length} ${parsed.rows.length === 1 ? "student" : "students"}`}
              </button>
            </div>
          </div>
          {parsed.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">First rows of your list, as Findtern read them</caption>
                <thead className="text-xs font-medium text-text-subtle">
                  <tr>
                    <th scope="col" className="px-5 py-2">Name</th>
                    <th scope="col" className="px-3 py-2">Phone</th>
                    <th scope="col" className="px-3 py-2">Email</th>
                    <th scope="col" className="px-3 py-2">Roll no.</th>
                    <th scope="col" className="px-5 py-2">Year, branch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 border-t border-ink-100">
                  {parsed.rows.slice(0, PREVIEW_ROWS).map((r) => (
                    <tr key={r.email}>
                      <td className="px-5 py-2 font-medium text-ink-900">{r.name || <span className="font-normal text-text-subtle">No name</span>}</td>
                      <td className="nums px-3 py-2 text-ink-700">{r.phone ?? <span className="text-text-subtle">—</span>}</td>
                      <td className="break-all px-3 py-2 text-ink-700">{r.email}</td>
                      <td className="nums px-3 py-2 text-ink-700">{r.rollNo ?? "—"}</td>
                      <td className="px-5 py-2 text-ink-700">{[r.year ? yearLabel(r.year) : null, r.branch].filter(Boolean).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > PREVIEW_ROWS ? <p className="border-t border-ink-100 px-5 py-2 text-xs text-text-subtle">and {parsed.rows.length - PREVIEW_ROWS} more</p> : null}
            </div>
          ) : null}
          {parsed.errors.length ? (
            <details className="border-t border-ink-100 px-5 py-3" open={parsed.rows.length === 0}>
              <summary className="cursor-pointer text-sm font-medium text-ink-800">
                {parsed.rows.length === 0 ? "Why nothing could be read" : `${parsed.errors.length} ${parsed.errors.length === 1 ? "row" : "rows"} to check (the rest will still be saved)`}
              </summary>
              <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-sm text-ink-700">
                {parsed.errors.slice(0, 100).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
      <p className="text-xs text-text-subtle">Saving again updates students by email. Nobody is removed, and phone numbers you saved earlier are kept.</p>
    </div>
  );
}
