"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { FilterTabs } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import type { ImportPreview, PreviewRow } from "@/lib/college/roster-import";

/**
 * Admin: upload a college's roster, read the preview (every bad row with its reason), fix the column mapping,
 * then confirm. Nothing is written to the roster until "Import".
 */

type Sent = { ok: boolean; status: number; json: Record<string, unknown> };
async function send(url: string, method: string, body: unknown): Promise<Sent> {
  const res = await csrfFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: Boolean(res?.ok), status: res?.status ?? 0, json: json ?? {} };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

type Needs = { importId: string; headers: string[]; mapping: ImportPreview["mapping"] };
type Filter = "all" | "valid" | "update" | "review" | "invalid" | "duplicate";
type Committed = { created: number; updated: number; autoLinked: number; review: number; skippedInvalid: number };

const select = "h-10 w-full rounded-apple-sm border border-ink-200 bg-surface px-2 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";
const SHOWN = 200;

const rowTone = (r: PreviewRow) => (r.status === "invalid" ? "danger" : r.status === "duplicate" ? "warning" : r.match === "review" ? "warning" : r.status === "update" ? "info" : "success");
const rowLabel = (r: PreviewRow) => (r.status === "valid" ? (r.match === "email" ? "New, linked" : r.match === "review" ? "New, review" : "New") : r.status === "update" ? "Update" : r.status === "invalid" ? "Invalid" : "Duplicate");

export function CollegeRosterImports({ collegeId, canEdit }: { collegeId: string; canEdit: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [needs, setNeeds] = useState<Needs | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [allowOver, setAllowOver] = useState(false);
  const [done, setDone] = useState<Committed | null>(null);

  const base = `/api/admin/colleges/${collegeId}/roster-imports`;
  const active = preview ?? needs;
  const importId = preview?.importId ?? needs?.importId;
  const headers = preview?.headers ?? needs?.headers ?? [];
  const mapping = preview?.mapping ?? needs?.mapping;

  function reset() {
    setPreview(null);
    setNeeds(null);
    setError(null);
    setFilter("all");
    setShowAll(false);
    setAllowOver(false);
  }

  async function upload(f: File) {
    reset();
    setDone(null);
    setBusy(true);
    const r = await send(base, "POST", { fileName: f.name, fileBase64: toBase64(await f.arrayBuffer()) });
    setBusy(false);
    if (r.ok) return setPreview(r.json as unknown as ImportPreview);
    if (typeof r.json.importId === "string") setNeeds({ importId: r.json.importId, headers: (r.json.headers as string[]) ?? [], mapping: r.json.mapping as Needs["mapping"] });
    setError(String(r.json.error ?? "Couldn't read that file. Try again."));
  }

  async function remap(form: FormData) {
    const num = (k: string) => Number(form.get(k));
    const phone = String(form.get("phone"));
    setBusy(true);
    const r = await send(`${base}/${importId}`, "PATCH", { action: "remap", mapping: { name: num("name"), email: num("email"), phone: phone === "-1" ? null : Number(phone) } });
    setBusy(false);
    if (!r.ok) return setError(String(r.json.error ?? "Couldn't apply that mapping"));
    setError(null);
    setNeeds(null);
    setPreview(r.json as unknown as ImportPreview);
  }

  async function commit() {
    if (!preview) return;
    const c = preview.counts;
    const ok = await ask({
      title: `Import ${c.valid + c.update} students?`,
      body: `${c.valid} new and ${c.update} updated. ${c.invalid + c.duplicate} rows are skipped. ${c.matchedEmail} will link to an account by verified email; ${c.review} need your review. Nobody is removed from the roster.`,
      confirmLabel: "Import",
    });
    if (!ok) return;
    setBusy(true);
    const r = await send(`${base}/${preview.importId}`, "PATCH", { action: "commit", allowOverAllocation: allowOver });
    setBusy(false);
    if (!r.ok) return setError(String(r.json.error ?? "Couldn't import"));
    reset();
    setDone(r.json as unknown as Committed);
    router.refresh();
  }

  async function discard() {
    if (!importId) return;
    await send(`${base}/${importId}`, "PATCH", { action: "discard" });
    reset();
  }

  const counts = preview?.counts;
  const rows = (preview?.rows ?? []).filter((r) => (filter === "all" ? true : filter === "review" ? r.match === "review" : r.status === filter));
  const shown = showAll ? rows : rows.slice(0, SHOWN);
  const over = preview ? preview.overAllocation.rosterAfter > preview.overAllocation.paidSeats : false;
  const importable = counts ? counts.valid + counts.update : 0;

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={file}
            type="file"
            id={`roster-file-${collegeId}`}
            accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) await upload(f);
            }}
          />
          <label
            htmlFor={`roster-file-${collegeId}`}
            className={cn(buttonClass({ className: ADMIN_PILL_PRIMARY }), "cursor-pointer focus-within:outline-2", busy && "pointer-events-none opacity-60")}
          >
            <Upload className="size-4" aria-hidden /> {busy && !preview ? "Reading…" : "Upload roster"}
          </label>
          <span className="text-sm text-text-subtle">.csv, .tsv or .xlsx, up to 2 MB. Needs an email column; name and mobile are picked up. The same file twice is the same import.</span>
        </div>
      ) : (
        <p className="text-sm text-text-subtle">You can view imports but not upload.</p>
      )}

      <div role="status" aria-live="polite">
        {done ? (
          <p className="rounded-apple-sm border border-ink-200 bg-[color:var(--admin-panel-2)] px-4 py-3 text-sm text-foreground">
            Imported: {done.created} new, {done.updated} updated, {done.autoLinked} linked by email, {done.review} to review, {done.skippedInvalid} skipped.
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {active && mapping ? (
        <details open={!preview} className="rounded-apple-sm border border-ink-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Columns in this file</summary>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              await remap(new FormData(e.currentTarget));
            }}
          >
            <label>
              <span className="text-sm font-medium text-foreground">Email (required)</span>
              <select name="email" defaultValue={mapping.email} className={cn(select, "mt-1")} required>
                <option value={-1} disabled>
                  Choose a column
                </option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-medium text-foreground">Name</span>
              <select name="name" defaultValue={mapping.name} className={cn(select, "mt-1")}>
                <option value={-1}>None</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-medium text-foreground">Mobile</span>
              <select name="phone" defaultValue={mapping.phone ?? -1} className={cn(select, "mt-1")}>
                <option value={-1}>None</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy} className={buttonClass({ className: ADMIN_PILL_SECONDARY })}>
              Apply columns
            </button>
          </form>
        </details>
      ) : null}

      {preview && counts ? (
        <div className="space-y-3">
          {over ? (
            <div role="alert" className="rounded-apple-sm border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-medium">
                This puts the roster at {preview.overAllocation.rosterAfter} students, above the {preview.overAllocation.paidSeats} paid seats.
              </p>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-foreground">
                <input type="checkbox" checked={allowOver} onChange={(e) => setAllowOver(e.target.checked)} className="size-5 accent-brand-700" />
                Import anyway
              </label>
            </div>
          ) : null}

          <FilterTabs
            label="Show rows"
            value={filter}
            onChange={(k) => {
              setFilter(k as Filter);
              setShowAll(false);
            }}
            tabs={[
              { key: "all", label: "All", count: counts.total },
              { key: "valid", label: "New", count: counts.valid },
              { key: "update", label: "Update", count: counts.update },
              { key: "review", label: "Needs review", count: counts.review },
              { key: "invalid", label: "Invalid", count: counts.invalid },
              { key: "duplicate", label: "Duplicate", count: counts.duplicate },
            ]}
          />

          <div className="overflow-x-auto rounded-apple-sm border border-ink-200">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Roster preview, {rows.length} rows</caption>
              <thead className="border-b border-ink-100 bg-[color:var(--admin-panel-2)] text-xs font-semibold text-text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2">Line</th>
                  <th scope="col" className="px-3 py-2">Student</th>
                  <th scope="col" className="px-3 py-2">Mobile</th>
                  <th scope="col" className="px-3 py-2">Result</th>
                  <th scope="col" className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {shown.map((r) => (
                  <tr key={r.line}>
                    <td className="nums px-3 py-2 text-text-subtle">{r.line}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{r.name || "—"}</p>
                      <p className="break-all text-xs text-text-subtle">{r.email || "no email"}</p>
                    </td>
                    <td className="nums px-3 py-2 text-foreground">{r.phone || "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={rowTone(r)} label={rowLabel(r)} />
                    </td>
                    <td className="px-3 py-2 text-foreground">{r.reason ?? ""}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-text-subtle">
                      No rows in this view.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length ? (
            <button type="button" onClick={() => setShowAll(true)} className={buttonClass({ variant: "outline", size: "sm" })}>
              Show all {rows.length}
            </button>
          ) : null}

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={commit} disabled={busy || importable === 0 || preview.status !== "previewed" || (over && !allowOver)} className={buttonClass({ className: ADMIN_PILL_PRIMARY })}>
                {preview.status === "committed" ? "Already imported" : busy ? "Importing…" : `Import ${importable} students`}
              </button>
              {preview.status === "previewed" ? (
                <button type="button" onClick={discard} className={buttonClass({ className: ADMIN_PILL_SECONDARY })}>
                  Discard
                </button>
              ) : (
                <button type="button" onClick={reset} className={buttonClass({ className: ADMIN_PILL_SECONDARY })}>
                  Close preview
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
