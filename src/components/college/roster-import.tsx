"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/** Upload or paste the college's student list. Upserts by email; never deletes. */
export function RosterImport() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; errors: string[] } | null>(null);

  async function submit(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    const res = await csrfFetch("/api/college/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { imported?: number; verified?: number; errors?: string[]; error?: string } | null;
    setBusy(false);
    if (!res?.ok || !body) {
      setResult({ ok: false, text: body?.error ?? "Couldn't import. Try again.", errors: body?.errors ?? [] });
      return;
    }
    setResult({
      ok: true,
      text: `Imported ${body.imported} student${body.imported === 1 ? "" : "s"}.${body.verified ? ` ${body.verified} ${body.verified === 1 ? "student who had joined is" : "students who had joined are"} now verified.` : ""}`,
      errors: body.errors ?? [],
    });
    setCsv("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-ink-700">
        A CSV or Excel export with an <strong>Email</strong> column. Name, roll number, year (or semester) and branch are picked up if present. Uploading again updates rows; nobody is removed.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv,.tsv,text/tab-separated-values"
          className="sr-only"
          id="roster-file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await submit(await f.text());
            e.target.value = "";
          }}
        />
        <label
          htmlFor="roster-file"
          className={cn(
            "apple-spring apple-pressable inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-brand-700 px-4 text-[14px] font-semibold text-white hover:bg-brand-600 focus-within:outline-2",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="size-4" aria-hidden /> {busy ? "Importing…" : "Upload CSV"}
        </label>
        <span className="text-[13px] text-text-subtle">From Excel: File → Save as → CSV.</span>
      </div>
      <details>
        <summary className="cursor-pointer text-[14px] font-medium text-brand-800">Or paste rows</summary>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          aria-label="Roster rows"
          placeholder={"Email,Name,Roll No,Year,Branch\nasha.sharma@college.edu.in,Asha Sharma,22CS014,3,CSE"}
          className="mt-2 min-h-36 w-full rounded-[10px] border border-ink-200 bg-white px-3 py-2.5 font-mono text-[13px] text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <button
          type="button"
          disabled={busy || !csv.trim()}
          onClick={() => submit(csv)}
          className="apple-spring apple-pressable mt-2 inline-flex min-h-11 items-center rounded-[10px] border border-ink-200 bg-white px-4 text-[14px] font-medium text-ink-800 shadow-2xs hover:bg-ink-50 disabled:opacity-60"
        >
          Import pasted rows
        </button>
      </details>
      <div role="status" aria-live="polite">
        {result ? (
          <div className={cn("rounded-[10px] border px-4 py-3 text-[14px]", result.ok ? "border-brand-200 bg-brand-50 text-brand-900" : "border-danger/30 bg-danger-soft text-danger")}>
            <p>{result.text}</p>
            {result.errors.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-ink-700">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
