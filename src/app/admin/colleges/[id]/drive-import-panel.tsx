"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Pill, type Tone } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { MAX_UPLOAD_BYTES, confirmBlockers, type EntryCounts } from "@/lib/drives/admin-rules";
import type { OrderDto } from "@/lib/drives/admin-db";

type Mapping = { name?: number; email?: number; phone?: number };
type Row = { rowNo: number; name: string; email: string; phone: string | null; state: string; reasons: string[] };
type Preview = { importId: string | null; needsMapping: boolean; headers: string[]; mapping: Mapping; rows: Row[]; counts: EntryCounts | null; status: string; truncated: boolean };

const STATE: Record<string, { label: string; tone: Tone }> = {
  valid: { label: "Valid", tone: "paid" },
  invalid: { label: "Invalid", tone: "closed" },
  duplicate: { label: "Duplicate", tone: "waiting" },
  ambiguous: { label: "Ambiguous", tone: "waiting" },
  over_allocation: { label: "Over slots", tone: "closed" },
};
const REASON: Record<string, string> = {
  name_missing: "Name is empty",
  email_invalid: "Email is missing or not valid",
  phone_invalid: "Phone is not an Indian mobile number",
  duplicate_email_in_file: "Same email appears earlier in the file",
  already_on_order: "Already on this order from an earlier file",
  over_allocation: "More students than the order has slots",
};
const field = "h-9 w-full rounded-md border border-ink-200 bg-surface px-2 text-sm touch:min-h-11";

/** Upload a roster, map its columns, read the preview and confirm. The server re-derives every row on confirm. */
export function DriveImportPanel({ order }: { order: OrderDto }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [attempt] = useState(() => crypto.randomUUID());

  async function upload(f: File, m: Mapping | null) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const body = new FormData();
      body.set("file", f);
      if (m) body.set("mapping", JSON.stringify(m));
      const res = await csrfFetch(`/api/admin/drive-orders/${order.id}/imports`, { method: "POST", body });
      const data = (await res.json().catch(() => null)) as (Partial<Preview> & { error?: string; suggestedMapping?: Mapping }) | null;
      if (!res.ok || !data) return setError(data?.error ?? "That did not work. Try again.");
      const next = data.mapping ?? data.suggestedMapping ?? {};
      setMapping(next);
      setPreview({ importId: data.importId ?? null, needsMapping: !!data.needsMapping, headers: data.headers ?? [], mapping: next, rows: data.rows ?? [], counts: data.counts ?? null, status: data.status ?? "preview", truncated: !!data.truncated });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    setError(null);
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) return setError("The file is larger than 5 MB.");
    void upload(f, null);
  }

  async function confirm() {
    if (!preview?.importId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/imports/${preview.importId}/confirm`, { method: "POST", headers: { "idempotency-key": attempt } });
      const data = (await res.json().catch(() => null)) as { error?: string; result?: { linked: number; reviews: number; codesIssued: number } } | null;
      if (!res.ok || !data?.result) return setError(data?.error ?? "That did not work. Try again.");
      setDone(`Done. ${data.result.linked} students already have an account: they were told and can accept in one click. The other ${data.result.codesIssued - data.result.linked} were emailed a code. ${data.result.reviews} need a quick check in Identity review.`);
      setPreview({ ...preview, status: "confirmed" });
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const counts = preview?.counts ?? null;
  const blockers = counts ? confirmBlockers(counts) : [];
  const canConfirm = !!preview?.importId && preview.status === "preview" && order.status === "paid" && blockers.length === 0 && !busy;
  const mapOk = mapping.email !== undefined && mapping.name !== undefined;
  const setCol = (k: keyof Mapping, v: string) => setMapping((m) => ({ ...m, [k]: v === "" ? undefined : Number(v) }));

  return (
    <div className="space-y-4" aria-busy={busy}>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Import steps">
        {["Upload", "Map columns", "Preview", "Confirm"].map((s, i) => {
          const cur = preview?.status === "confirmed" ? 3 : !preview ? 0 : !counts || preview.needsMapping ? 1 : canConfirm ? 3 : 2;
          return <li key={s} aria-current={i === cur ? "step" : undefined} className={i === cur ? "font-semibold text-ink-900" : "text-ink-500"}>{i + 1}. {s}{i < cur ? " (done)" : ""}</li>;
        })}
      </ol>
      <label className="block text-sm">Roster file (CSV or Excel, up to 5 MB)
        <input type="file" accept=".csv,.xlsx,text/csv" className={field} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      {busy && !preview ? <p className="text-sm text-ink-500" role="status">Reading the file…</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {order.status !== "paid" ? <p className="text-sm text-ink-500">You can preview a roster now. Codes can be issued once the order is paid.</p> : null}

      {preview ? (
        <>
          <fieldset className="grid gap-3 sm:grid-cols-3" disabled={busy || preview.status === "confirmed"}>
            <legend className="mb-1 text-sm font-medium">Which column is which?</legend>
            {(["name", "email", "phone"] as const).map((k) => (
              <label key={k} className="text-sm capitalize">{k}{k === "phone" ? " (optional)" : ""}
                <select className={field} value={mapping[k] ?? ""} onChange={(e) => setCol(k, e.target.value)}>
                  <option value="">{k === "phone" ? "None" : "Choose a column"}</option>
                  {preview.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
            <div className="sm:col-span-3">
              <button type="button" disabled={!file || !mapOk || busy} className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => file && upload(file, mapping)}>Apply columns</button>
            </div>
          </fieldset>

          {preview.needsMapping ? <p className="text-sm text-ink-500">We could not tell which columns hold name and email. Choose them, then apply.</p> : null}

          {counts ? (
            <div className="space-y-3">
              <ul className="flex flex-wrap gap-2" aria-label="Rows by state">
                {(Object.keys(STATE) as (keyof typeof STATE)[]).map((s) => <li key={s}><Pill tone={STATE[s].tone}>{STATE[s].label}: {counts[s as keyof EntryCounts]}</Pill></li>)}
                <li><Pill>Total: {counts.total}</Pill></li>
              </ul>
              {blockers.map((b) => <p key={b} role="alert" className="text-sm text-danger">{b}</p>)}
              <div className="max-h-96 overflow-auto rounded-md border border-ink-200">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Roster preview</caption>
                  <thead className="sticky top-0 bg-surface text-xs text-ink-500"><tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Status</th><th className="p-2">Why</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.rowNo} className="border-t border-ink-100">
                        <td className="p-2">{r.rowNo}</td><td className="p-2">{r.name}</td><td className="p-2 break-all">{r.email}</td>
                        <td className="p-2"><Pill tone={STATE[r.state]?.tone ?? "neutral"}>{STATE[r.state]?.label ?? r.state}</Pill></td>
                        <td className="p-2 text-ink-600">{r.state === "valid" ? "" : r.reasons.map((x) => REASON[x] ?? x).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.truncated ? <p className="text-xs text-ink-500">Showing the first 1,000 rows. Counts cover the whole file.</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={!canConfirm} className={buttonClass({ variant: "primary", size: "sm" })} onClick={confirm}>{busy ? "Working…" : "Confirm and issue codes"}</button>
                {preview.status === "confirmed" ? <Pill tone="paid">Confirmed</Pill> : null}
                {!canConfirm && preview.status === "preview" ? <p className="text-xs text-ink-500" role="status">{blockers.length ? "Fix the problems above and upload the file again to confirm." : order.status !== "paid" ? "Confirm unlocks once the order is marked paid." : busy ? "Working…" : "Nothing to confirm yet."}</p> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {done ? <p role="status" className="text-sm text-success">{done}</p> : null}
    </div>
  );
}
