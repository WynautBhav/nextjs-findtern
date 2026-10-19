"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

/** Upload an Excel (.xlsx) or CSV sheet of AI-interview ratings; matches rows to interns by email. */
export function RatingsImport() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    const xlsx = /\.xlsx$/i.test(file.name);
    const res = await csrfFetch("/api/admin/interns/ratings-import", {
      method: "POST",
      headers: { "Content-Type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv" },
      body: xlsx ? await file.arrayBuffer() : await file.text(),
    });
    const data = (await res.json().catch(() => ({}))) as { updated?: number; failures?: { row: number; reason: string }[]; error?: string };
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) return setResult(data.error ?? "Import failed.");
    const f = data.failures ?? [];
    setResult(`${data.updated ?? 0} updated${f.length ? `, ${f.length} skipped (${f.slice(0, 3).map((x) => `row ${x.row}: ${x.reason}`).join("; ")}${f.length > 3 ? "…" : ""})` : ""}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50">
        <Upload className="size-4" aria-hidden />
        {busy ? "Importing…" : "Import ratings"}
        <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      <a href="/api/admin/interns/ratings-import" className="text-xs font-medium text-brand-700 underline-offset-4 hover:underline">
        Excel template
      </a>
      <a href="/api/admin/interns/ratings-import?format=csv" className="text-xs font-medium text-brand-700 underline-offset-4 hover:underline">
        CSV
      </a>
      {result ? <span role="status" className="w-full text-xs text-text-subtle sm:w-auto">{result}</span> : null}
    </div>
  );
}
