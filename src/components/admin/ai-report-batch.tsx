"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Upload, X } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { StatusBadge, type StatusTone } from "@/components/admin/status-badge";
import { buttonClass } from "@/components/ui/button";
import {
  parseReportHeader,
  type ReportHeader,
} from "@/lib/admin/ai-report-match";
import type { Leak } from "@/lib/admin/ai-report/redact";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

const MAX_FILES = 50;

type Cand = {
  id: string;
  name: string;
  email: string;
  phone: string;
  hasReport: boolean;
};
type Step = "reading" | "ready" | "working" | "done" | "error";

type Row = {
  key: string;
  file: File;
  step: Step;
  header?: ReportHeader;
  match?: "matched" | "check" | "none";
  reasons?: string[];
  candidates: Cand[];
  /** The candidate this report will be published for. */
  internId?: string;
  /** Progress while working, the reason when it failed or needs a look. */
  note?: string;
  leaks?: Leak[];
  allowLeaks?: boolean;
  previewUrl?: string;
  link?: string;
};

export type DriveState = "ready" | "reconnect" | "not_configured" | null;

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

/** One PUT of the whole file to Google's resumable-upload URL, with progress. Resolves with the Drive file id. */
function putToDrive(
  url: string,
  blob: Blob,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", "application/pdf");
    x.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onerror = () =>
      reject(new Error("Could not reach Google Drive from this browser."));
    x.onload = () => {
      if (x.status < 200 || x.status >= 300)
        return reject(
          new Error(`Google Drive rejected the upload (${x.status}).`),
        );
      try {
        const id = (JSON.parse(x.responseText) as { id?: string }).id;
        if (id) return resolve(id);
      } catch {}
      reject(new Error("Google Drive did not confirm the upload."));
    };
    x.send(blob);
  });
}

const STEP_TONE: Record<Step, StatusTone> = {
  reading: "neutral",
  ready: "info",
  working: "warning",
  done: "success",
  error: "danger",
};

function rowStatus(
  r: Row,
  blocked: boolean,
): { label: string; tone: StatusTone } {
  if (blocked) return { label: "Duplicate", tone: "danger" };
  if (r.step === "reading") return { label: "Reading", tone: "neutral" };
  if (r.step === "working") return { label: "Working", tone: "warning" };
  if (r.step === "done") return { label: "Published", tone: "success" };
  if (r.step === "error") return { label: "Failed", tone: "danger" };
  if (r.leaks?.length && !r.allowLeaks)
    return { label: "Needs a look", tone: "danger" };
  if (!r.internId)
    return {
      label: r.match === "none" ? "No match" : "Pick candidate",
      tone: "warning",
    };
  return {
    label: r.match === "matched" ? "Matched" : "Confirmed",
    tone: STEP_TONE.ready,
  };
}

export function AiReportBatch({ drive }: { drive: DriveState }) {
  const input = useRef<HTMLInputElement>(null);
  // The redacted PDF per row, so a preview followed by a publish redacts once.
  const redacted = useRef(
    new Map<string, { blob: Blob; leaks: Leak[]; blurred: number }>(),
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState<Record<string, string>>({});

  const patch = (key: string, p: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const driveReady = drive === "ready";

  async function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const pdfs = Array.from(list).filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
    );
    if (!pdfs.length) return setNotice("Only PDF files are supported.");
    const room = MAX_FILES - rows.length;
    if (room <= 0) return setNotice(`At most ${MAX_FILES} reports at a time.`);
    setNotice(
      pdfs.length > room
        ? `Only the first ${room} were added (limit ${MAX_FILES}).`
        : null,
    );
    const fresh: Row[] = pdfs.slice(0, room).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      step: "reading",
      candidates: [],
    }));
    setRows((all) => [...all, ...fresh]);

    // Read each report's header block (client-side), then ask the server who they belong to.
    const { readHeaderLines } = await import("@/lib/admin/ai-report/redact");
    const headers: { key: string; header: ReportHeader }[] = [];
    for (const r of fresh) {
      try {
        const { lines, pages } = await readHeaderLines(r.file);
        const header = parseReportHeader(lines);
        headers.push({ key: r.key, header });
        patch(r.key, {
          header,
          step: "ready",
          note:
            pages < 2 ? "Only one page: is this the full report?" : undefined,
        });
      } catch {
        patch(r.key, { step: "error", note: "This PDF could not be read." });
      }
    }
    if (!headers.length) return;
    const res = await csrfFetch("/api/admin/ai-reports/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headers: headers.map(({ key, header }) => ({ key, ...header })),
      }),
    });
    const data = await readJson<{
      results?: {
        key: string;
        status: "matched" | "check" | "none";
        reasons?: string[];
        internId?: string;
        candidates: Cand[];
      }[];
    }>(res);
    if (!res.ok || !data.results) {
      for (const h of headers)
        patch(h.key, {
          step: "error",
          note: data.error ?? "Matching failed. Try again.",
        });
      return;
    }
    for (const m of data.results)
      patch(m.key, {
        match: m.status,
        reasons: m.reasons,
        internId: m.internId,
        candidates: m.candidates,
      });
  }

  async function lookUp(key: string) {
    const q = (search[key] ?? "").trim();
    if (q.length < 2) return;
    const res = await csrfFetch("/api/admin/ai-reports/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ search: q }),
    });
    const data = await readJson<{ candidates?: Cand[] }>(res);
    patch(
      key,
      res.ok
        ? {
            candidates: data.candidates ?? [],
            note: data.candidates?.length
              ? undefined
              : "No candidate found for that.",
          }
        : { note: data.error ?? "Search failed." },
    );
  }

  /** Redacts in this browser (once per row) and shows the result. Returns null if it failed. */
  async function redactRow(row: Row) {
    const cached = redacted.current.get(row.key);
    if (cached) return cached;
    if (!row.header) return null;
    const { redactReport } = await import("@/lib/admin/ai-report/redact");
    const out = await redactReport(row.file, row.header);
    const keep = { blob: out.blob, leaks: out.leaks, blurred: out.blurred };
    redacted.current.set(row.key, keep);
    patch(row.key, { previewUrl: out.previewUrl, leaks: out.leaks });
    return keep;
  }

  async function preview(key: string) {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    patch(key, { step: "working", note: "Redacting…" });
    try {
      const out = await redactRow(row);
      patch(key, {
        step: "ready",
        note: out
          ? `${out.blurred} line${out.blurred === 1 ? "" : "s"} blurred on page 1.${out.leaks.length ? "" : " Nothing readable left."}`
          : undefined,
      });
    } catch (e) {
      patch(key, {
        step: "error",
        note: e instanceof Error ? e.message : "Could not redact this PDF.",
      });
    }
  }

  async function publish(key: string) {
    const row = rows.find((r) => r.key === key);
    if (!row || !row.internId || !row.header) return;
    const internId = row.internId;
    patch(key, { step: "working", note: "Redacting…" });
    try {
      const out = await redactRow(row);
      if (!out) return;
      if (out.leaks.length && !row.allowLeaks) {
        patch(key, { step: "ready", note: undefined });
        return;
      }
      patch(key, { note: "Starting upload…" });
      const sRes = await csrfFetch("/api/admin/ai-reports/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          internId,
          canId: row.header.canId,
          size: out.blob.size,
        }),
      });
      const session = await readJson<{ uploadUrl?: string }>(sRes);
      if (!sRes.ok || !session.uploadUrl)
        throw new Error(session.error ?? "Could not start the upload.");

      const fileId = await putToDrive(session.uploadUrl, out.blob, (pct) =>
        patch(key, { note: `Uploading to Drive… ${pct}%` }),
      );
      patch(key, { note: "Saving link…" });
      const aRes = await csrfFetch("/api/admin/ai-reports/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internId, fileId }),
      });
      const attached = await readJson<{ link?: string }>(aRes);
      if (!aRes.ok || !attached.link)
        throw new Error(attached.error ?? "Could not attach the report.");
      patch(key, { step: "done", link: attached.link, note: undefined });
    } catch (e) {
      patch(key, {
        step: "error",
        note: e instanceof Error ? e.message : "Failed.",
      });
    }
  }

  // Two files for one candidate would silently replace each other: block the later ones.
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of rows) {
    if (!r.internId || r.step === "done") continue;
    if (seen.has(r.internId)) dupes.add(r.key);
    seen.add(r.internId);
  }
  const publishable = rows.filter(
    (r) =>
      r.internId &&
      (r.step === "ready" || r.step === "error") &&
      !dupes.has(r.key) &&
      (!r.leaks?.length || r.allowLeaks),
  );
  const done = rows.filter((r) => r.step === "done");

  async function publishAll() {
    setBusy(true);
    setNotice(null);
    for (const r of publishable) await publish(r.key);
    setBusy(false);
  }

  async function copyLinks() {
    const lines = done.map((r) => {
      const c = r.candidates.find((x) => x.id === r.internId);
      return [c?.email ?? "", c?.name ?? "", r.link ?? ""]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(",");
    });
    try {
      await navigator.clipboard.writeText(
        ["email,name,link", ...lines].join("\n"),
      );
      setNotice("Links copied as CSV (email, name, link).");
    } catch {
      setNotice("Could not copy. Select the links by hand instead.");
    }
  }

  return (
    <div className="space-y-6">
      {drive !== "ready" ? (
        <div
          role="status"
          className="rounded-apple-lg border border-accent-300/70 bg-accent-100/60 px-4 py-3 text-sm leading-relaxed text-foreground"
        >
          {drive === "not_configured"
            ? "Google is not configured on this server, so reports can be matched and checked but not saved to Drive."
            : drive === "reconnect"
              ? "Google needs to be reconnected (it now also needs Drive). Reports can be matched and checked until then."
              : "Couldn't check the Google connection just now."}{" "}
          <Link
            href="/admin/settings"
            className="font-medium underline underline-offset-4"
          >
            Open Settings
          </Link>
        </div>
      ) : null}

      <Panel>
        <PanelHeader
          title="1 · Add Incruiter reports"
          description="Drop the PDFs you downloaded. Each one is read in this browser and matched to a candidate by phone and name. Nothing is uploaded until you publish."
        />
        <PanelBody>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "rounded-apple-lg border-2 border-dashed p-6 text-center",
              dragging ? "border-brand-600 bg-brand-50" : "border-ink-200",
            )}
          >
            <label
              className={cn(
                buttonClass({ variant: "outline", size: "md" }),
                "cursor-pointer text-sm focus-within:outline-2 focus-within:outline-brand-600",
              )}
            >
              <Upload className="size-4" aria-hidden />
              Choose PDF reports
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-2 text-sm text-ink-600">
              or drag them here · up to {MAX_FILES} at a time
            </p>
          </div>
        </PanelBody>
      </Panel>

      <div aria-live="polite" className="min-h-5 text-sm text-ink-700">
        {notice}
      </div>

      {rows.length > 0 ? (
        <Panel>
          <PanelHeader
            title="2 · Check and publish"
            description={`${rows.length} report${rows.length === 1 ? "" : "s"} · ${done.length} published`}
            action={
              <>
                {done.length > 0 ? (
                  <button
                    type="button"
                    onClick={copyLinks}
                    className={buttonClass({ variant: "outline", size: "sm" })}
                  >
                    Copy links
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void publishAll()}
                  disabled={busy || !driveReady || publishable.length === 0}
                  className={buttonClass({ variant: "primary", size: "sm" })}
                >
                  {busy
                    ? "Publishing…"
                    : `Redact & publish ${publishable.length || ""}`.trim()}
                </button>
              </>
            }
          />
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const chosen = r.candidates.find((c) => c.id === r.internId);
              const blocked = dupes.has(r.key);
              const st = rowStatus(r, blocked);
              const locked = r.step === "working" || r.step === "done";
              return (
                <li
                  key={r.key}
                  className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-start"
                >
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium text-foreground"
                      title={r.file.name}
                    >
                      {r.file.name}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {r.header ? (
                        <>
                          In the PDF: {r.header.name ?? "no name found"}
                          {r.header.phone ? ` · +${r.header.phone}` : ""}
                          {r.header.canId ? ` · ${r.header.canId}` : ""}
                        </>
                      ) : (
                        "Reading…"
                      )}
                    </p>
                  </div>

                  <div className="min-w-0 space-y-2 text-sm">
                    {r.match === "matched" && chosen ? (
                      <p className="text-foreground">
                        <span className="font-medium">{chosen.name}</span> ·{" "}
                        {chosen.email}
                        <span className="block text-ink-600">
                          {chosen.phone} · matched on {r.reasons?.join(", ")}
                          {chosen.hasReport
                            ? " · replaces their current report"
                            : ""}
                        </span>
                      </p>
                    ) : r.match ? (
                      <>
                        <select
                          aria-label={`Candidate for ${r.file.name}`}
                          value={r.internId ?? ""}
                          disabled={locked}
                          onChange={(e) =>
                            patch(r.key, {
                              internId: e.target.value || undefined,
                              match: "check",
                            })
                          }
                          className="min-h-11 w-full rounded-apple-md border border-ink-200 bg-card px-3 text-sm text-foreground"
                        >
                          <option value="">
                            {r.candidates.length
                              ? "Choose the candidate…"
                              : "No candidate found: search below"}
                          </option>
                          {r.candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.email} · {c.phone}
                              {c.hasReport ? " (has a report)" : ""}
                            </option>
                          ))}
                        </select>
                        {!locked ? (
                          <div className="flex gap-2">
                            <input
                              type="search"
                              aria-label={`Search candidates for ${r.file.name}`}
                              placeholder="Search name, email or phone"
                              value={search[r.key] ?? ""}
                              onChange={(e) =>
                                setSearch((s) => ({
                                  ...s,
                                  [r.key]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) =>
                                e.key === "Enter" && void lookUp(r.key)
                              }
                              className="min-h-11 min-w-0 flex-1 rounded-apple-md border border-ink-200 bg-card px-3 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => void lookUp(r.key)}
                              className={buttonClass({
                                variant: "outline",
                                size: "md",
                              })}
                            >
                              Search
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : r.step === "reading" ? (
                      <p className="text-ink-600">Matching…</p>
                    ) : null}

                    {r.leaks?.length ? (
                      <div
                        role="alert"
                        className="rounded-apple-md border border-danger/30 bg-danger-soft px-3 py-2 text-danger"
                      >
                        <p className="font-medium">
                          Still readable after redaction:
                        </p>
                        <ul className="mt-1 list-disc pl-5">
                          {r.leaks.slice(0, 4).map((l, i) => (
                            <li key={i}>
                              {l.what} on page {l.page}: “{l.text}”
                            </li>
                          ))}
                        </ul>
                        <label className="mt-2 flex min-h-11 items-center gap-2 text-foreground">
                          <input
                            type="checkbox"
                            checked={Boolean(r.allowLeaks)}
                            onChange={(e) =>
                              patch(r.key, { allowLeaks: e.target.checked })
                            }
                            className="size-4"
                          />
                          I have looked, publish anyway
                        </label>
                      </div>
                    ) : null}

                    {r.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a data: URL made in this browser
                      <img
                        src={r.previewUrl}
                        alt={`Redacted first page of ${r.file.name}`}
                        className="max-h-44 rounded-apple-md border border-border"
                      />
                    ) : null}
                    {r.note ? (
                      <p
                        className={cn(
                          "text-sm",
                          r.step === "error" ? "text-danger" : "text-ink-600",
                        )}
                      >
                        {r.note}
                      </p>
                    ) : null}
                    {blocked ? (
                      <p className="text-danger">
                        Another file in this batch is assigned to the same
                        candidate.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 md:justify-end">
                    <StatusBadge tone={st.tone} label={st.label} />
                    {r.link ? (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass({
                          variant: "outline",
                          size: "sm",
                        })}
                        aria-label={`Open the published report for ${r.file.name}`}
                      >
                        Open
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                    {(r.step === "ready" || r.step === "error") &&
                    r.header &&
                    !r.previewUrl ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void preview(r.key)}
                        className={buttonClass({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Preview
                      </button>
                    ) : null}
                    {r.step === "ready" &&
                    r.internId &&
                    !blocked &&
                    (!r.leaks?.length || r.allowLeaks) ? (
                      <button
                        type="button"
                        disabled={busy || !driveReady}
                        onClick={() => void publish(r.key)}
                        className={buttonClass({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Publish
                      </button>
                    ) : null}
                    {r.step === "error" && r.internId ? (
                      <button
                        type="button"
                        disabled={busy || !driveReady}
                        onClick={() => void publish(r.key)}
                        className={buttonClass({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Retry
                      </button>
                    ) : null}
                    {r.step !== "working" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRows((all) => all.filter((x) => x.key !== r.key))
                        }
                        aria-label={`Remove ${r.file.name}`}
                        className="inline-flex size-11 items-center justify-center rounded-apple-md text-ink-600 hover:text-foreground"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
