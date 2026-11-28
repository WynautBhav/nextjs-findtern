"use client";

import { Bell, Check, Columns3, Copy, Download, Mail, Phone, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

import { csvText, pinnedOf, shownColumns, tableCsv } from "./table-csv";
import { CountUp, FacePile, initials, tintOf } from "./visuals";

/**
 * The list behind any number on the dashboard: select rows, copy, email (bcc), call one, nudge students (manual, after
 * a confirm; an in-app notification and its email), export CSV with a column picker. Rows are people (students) or
 * companies; `note` carries the offer or meeting the row is about.
 */

/** Columns that hold sentences, not values: they wrap instead of cutting to one line. */
const PROSE = new Set(["What happened", "Reason", "Feedback"]);
const OPTIONAL = new Set(["Reason", "Feedback"]);

export type DrawerRow = {
  id: string;
  /** The person or company the row opens and the actions reach. */
  targetId: string;
  name: string;
  sub: string;
  note?: string;
  /** What happened with this person, in one line (their latest step). */
  what?: string;
  /** Last seen, already worded ("3 h ago", "Never", "Hidden"). */
  seen?: string;
  chip?: { label: string; tone: "good" | "wait" | "bad" | "plain" };
  email: string | null;
  phone: string | null;
  href: string | null;
  csv: Record<string, string | number | null>;
};

export type DrawerSpec = {
  title: string;
  sub: string;
  kind: "students" | "employers";
  rows: DrawerRow[];
  /** A station's list also has "Waiting here": the ones who have not reached the next stop. */
  waitingIds?: Set<string>;
  filename: string;
};

const CHIP: Record<NonNullable<DrawerRow["chip"]>["tone"], string> = {
  good: "bg-brand-50 text-brand-800",
  wait: "bg-accent-100 text-accent-700",
  bad: "bg-ink-100 text-ink-700",
  plain: "bg-ink-100 text-ink-700",
};

const PAGE = 100;

function download(name: string, table: string[][]) {
  const blob = new Blob([csvText(table)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function PeopleDrawer({
  spec,
  onClose,
  canNudge,
  onToast,
}: {
  spec: DrawerSpec | null;
  onClose: () => void;
  canNudge: boolean;
  onToast: (text: string, bad?: boolean) => void;
}) {
  return (
    <Dialog open={spec !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(50rem,calc(100dvh-1.5rem))] max-h-none max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-[1.75rem] border-0 bg-background p-0 shadow-[0_30px_80px_-20px_rgb(4_29_23/0.55),0_2px_6px_rgb(4_29_23/0.12)] sm:max-w-[min(80rem,calc(100%-3rem))]"
      >
        {spec ? <DrawerBody key={spec.title + spec.rows.length} spec={spec} canNudge={canNudge} onToast={onToast} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DrawerBody({ spec: full, canNudge, onToast: pageToast }: { spec: DrawerSpec; canNudge: boolean; onToast: (text: string, bad?: boolean) => void }) {
  // Inside the open dialog the page's toast is hidden from screen readers, so the result is said here too.
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const onToast = (text: string, bad = false) => {
    setNotice({ text, bad });
    pageToast(text, bad);
  };
  const [tab, setTab] = useState<"wait" | "all">(full.waitingIds ? "wait" : "all");
  const [q, setQ] = useState("");
  const spec = useMemo(() => {
    let rows = tab === "wait" && full.waitingIds ? full.rows.filter((r) => full.waitingIds!.has(r.id)) : full.rows;
    // Every word must match the name, email, phone, college line, what happened or the offer note.
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length) rows = rows.filter((r) => { const hay = [r.name, r.email, r.phone, r.sub, r.note, r.what].join(" ").toLowerCase(); return words.every((w) => hay.includes(w)); });
    return { ...full, rows };
  }, [full, tab, q]);
  // The header counts the tab (not the search), in words that match it.
  const tabCount = tab === "wait" && full.waitingIds ? full.waitingIds.size : full.rows.length;
  const tabLabel = full.waitingIds ? (tab === "wait" ? "waiting here" : "reached this point") : full.sub.replace(/^[\d,]+\s/, "");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  // Reason and Feedback only when some row has one (a completed meeting has no reason, a withdrawn one no feedback).
  const columns = useMemo(
    () => Object.keys(full.rows[0]?.csv ?? {}).filter((c) => !OPTIONAL.has(c) || full.rows.some((r) => r.csv[c] != null && r.csv[c] !== "")),
    [full.rows],
  );
  const [cols, setCols] = useState<Set<string>>(() => new Set(columns));
  const [colOpen, setColOpen] = useState(false);
  // The table and the CSV share one rule: the pinned name column, then the columns switched on, in this order.
  const pinned = pinnedOf(columns);
  const shownCols = shownColumns(columns, cols);
  const [nudge, setNudge] = useState<{ title: string; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  const picked = spec.rows.filter((r) => sel.has(r.id));
  const target = picked.length ? picked : spec.rows;
  const targetIds = [...new Set(target.map((r) => r.targetId))];
  const emails = [...new Set(target.map((r) => r.email).filter((e): e is string => Boolean(e)))];
  const scope = picked.length ? "selected" : "everyone in this list";
  const allOn = spec.rows.length > 0 && picked.length === spec.rows.length;

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function copy() {
    if (!target.length) return;
    const text = target.map((r) => [r.name, r.email ?? "", r.phone ?? ""].join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      onToast(`Copied ${target.length.toLocaleString("en-IN")} ${target.length === 1 ? "row" : "rows"}`);
    } catch {
      onToast("Could not copy. Your browser blocked the clipboard", true);
    }
  }

  function exportCsv() {
    if (!target.length) return;
    download(spec.filename, tableCsv(columns, cols, target));
  }

  async function sendNudge() {
    if (!nudge || !targetIds.length) return;
    setSending(true);
    try {
      const res = await csrfFetch("/api/admin/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interns: { all: false, ids: targetIds }, title: nudge.title, message: nudge.message, type: "nudge", data: {} }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = (body && body.error) || `Not sent (${res.status})`;
        onToast(res.status === 403 && /csrf/i.test(msg) ? "This page has been open too long. Reload it and try again; nothing was sent" : msg, true);
        return;
      }
      // The server sends to active accounts only; say how many it really reached.
      const sent = typeof body?.interns === "number" ? body.interns : targetIds.length;
      const skipped = targetIds.length - sent;
      onToast(`Nudge sent to ${sent.toLocaleString("en-IN")} ${sent === 1 ? "student" : "students"}${skipped > 0 ? `; ${skipped.toLocaleString("en-IN")} inactive skipped` : ""}`);
      setNudge(null);
    } catch {
      onToast("Network error, nothing was sent", true);
    } finally {
      setSending(false);
    }
  }

  // Mail apps cut long links: past ~1800 characters, stop at the last whole address (the CSV has everyone).
  const allMail = emails.join(",");
  const mailto = `mailto:?bcc=${encodeURIComponent(allMail.length > 1800 ? allMail.slice(0, allMail.lastIndexOf(",", 1800)) : allMail)}`;
  const one = picked.length === 1 ? picked[0] : null;
  const dock =
    "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-foreground transition-colors hover:bg-[color:var(--color-ink-100)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:opacity-40 touch:h-11";
  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 px-3 text-sm text-foreground transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:opacity-45 touch:h-11";
  const shownFaces = spec.rows.slice(0, 6).map((r) => ({ id: r.targetId, name: r.name }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The window's head is the hero's deep green: the list feels like it came out of the line. */}
      <header className="relative overflow-hidden bg-[#0a3a2c] px-6 pb-5 pt-6 text-[#f2faf6]">
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M-5 90 C 30 80, 45 35, 70 40 S 95 20, 105 12" fill="none" stroke="#fff" strokeWidth="0.7" />
        </svg>
        <div className="relative flex items-start justify-between gap-4">
          <DialogTitle className="text-balance text-xl font-medium leading-snug tracking-[-0.01em] text-[#f2faf6] sm:text-2xl">{spec.title}</DialogTitle>
          <DialogClose className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-[#f2faf6] transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:size-11">
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
        <div className="relative mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <CountUp value={tabCount} className="text-[2.5rem] font-semibold leading-none tracking-[-0.03em]" />
            <DialogDescription className="text-sm text-[#a9cbbd]">{tabLabel}</DialogDescription>
          </div>
          <FacePile faces={shownFaces} total={spec.rows.length} max={5} size="sm" ring="#0a3a2c" label={`${spec.rows.length} in this list`} />
        </div>
        {full.waitingIds ? (
          <div role="group" aria-label="Which people" className="relative mt-4 inline-flex rounded-full bg-white/10 p-1">
            {(
              [
                ["wait", "Waiting here", full.waitingIds.size],
                ["all", "Everyone", full.rows.length],
              ] as const
            ).map(([k, l, c]) => (
              <button
                key={k}
                type="button"
                aria-pressed={tab === k}
                onClick={() => {
                  setTab(k);
                  setSel(new Set());
                  setLimit(PAGE);
                }}
                className={cn(
                  "h-8 rounded-full px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:h-11",
                  tab === k ? "bg-[#f2faf6] font-medium text-[#0a3a2c]" : "text-[#cfe6db] hover:text-white",
                )}
              >
                {l} <span className="tabular-nums opacity-70">{c.toLocaleString("en-IN")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="relative flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3 sm:px-5">
        <label className="relative w-full">
          <span className="sr-only">Search this list</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(new Set());
              setLimit(PAGE);
            }}
            placeholder="Search"
            className="h-11 w-full rounded-full border border-ink-200 bg-ink-50 pl-10 pr-4 text-sm text-foreground placeholder:text-ink-400 focus-visible:border-brand-500 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          />
        </label>
        <label className="mr-auto inline-flex cursor-pointer max-sm:w-full items-center gap-2.5 rounded-full py-1 pl-1 pr-2 text-sm text-text-subtle">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={allOn}
            onChange={() => setSel(allOn ? new Set() : new Set(spec.rows.map((r) => r.id)))}
            aria-label="Select everyone in this list"
          />
          <span aria-hidden className={cn("grid size-5 place-items-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring", allOn ? "border-brand-700 bg-brand-700 text-white" : picked.length ? "border-brand-700 bg-brand-100" : "border-ink-300")}>
            {allOn ? <Check className="size-3.5" /> : picked.length ? <span className="h-0.5 w-2.5 rounded bg-brand-700" /> : null}
          </span>
          <span className="tabular-nums">{picked.length ? <><strong className="font-semibold text-foreground">{picked.length.toLocaleString("en-IN")}</strong> selected</> : `${spec.rows.length.toLocaleString("en-IN")} ${q ? "found" : "in list"}`}</span>
        </label>
        <div className="flex items-center rounded-full bg-ink-50 p-0.5">
          <button type="button" className={dock} onClick={copy} aria-disabled={!target.length} title={`Copy name, email and phone of ${scope}`} aria-label="Copy">
            <Copy className="size-4" aria-hidden />
            <span className="max-sm:hidden">Copy</span>
          </button>
          <a className={dock} href={emails.length ? mailto : undefined} aria-disabled={!emails.length} title={`Email ${scope}`} aria-label="Email">
            <Mail className="size-4" aria-hidden />
            <span className="max-sm:hidden">Email</span>
          </a>
          <a className={dock} href={one?.phone ? `tel:${one.phone.replace(/\s/g, "")}` : undefined} aria-disabled={!one?.phone} title={one ? "Call" : "Select one to call"} aria-label="Call">
            <Phone className="size-4" aria-hidden />
            <span className="max-sm:hidden">Call</span>
          </a>
          {spec.kind === "students" && canNudge ? (
            <button type="button" className={dock} aria-disabled={!targetIds.length} onClick={() => (targetIds.length ? setNudge({ title: "A quick nudge from Findtern", message: "" }) : null)} title={`Nudge ${scope}`} aria-label="Nudge">
              <Bell className="size-4" aria-hidden />
              <span className="max-sm:hidden">Nudge</span>
            </button>
          ) : null}
          <button type="button" className={dock} onClick={() => setColOpen((o) => !o)} aria-expanded={colOpen} aria-label="Choose columns" title="Choose columns">
            <Columns3 className="size-4" aria-hidden />
            <span className="max-sm:hidden">Columns</span>
          </button>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          aria-disabled={!target.length}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:opacity-45 touch:h-11"
        >
          <Download className="size-4" aria-hidden />
          CSV
        </button>
        {colOpen ? (
          <fieldset className="w-full rounded-2xl bg-ink-50 p-3">
            <legend className="sr-only">Columns</legend>
            <p className="mb-2 text-xs text-text-subtle">Columns shown here and in the CSV</p>
            <div className="flex flex-wrap gap-1.5">
              {columns.filter((c) => c !== pinned).map((c) => {
                const on = cols.has(c);
                return (
                  <label key={c} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", on ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-background text-text-subtle hover:border-ink-300")}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() =>
                        setCols((x) => {
                          const n = new Set(x);
                          if (n.has(c)) n.delete(c);
                          else n.add(c);
                          return n;
                        })
                      }
                    />
                    {on ? <Check className="size-3" aria-hidden /> : null}
                    {c}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </div>

      <p role={notice?.bad ? "alert" : "status"} className={cn("text-sm", notice ? "mx-4 mt-3 rounded-xl px-3 py-2 sm:mx-5" : "sr-only", notice?.bad ? "bg-[#fdecec] text-[#9b1c1c]" : "bg-brand-50 text-brand-800")}>
        {notice?.text ?? ""}
      </p>

      {nudge ? (
        <form
          className="mx-4 mt-3 space-y-3 rounded-2xl border border-accent-200 bg-accent-100/60 p-4 sm:mx-5"
          onSubmit={(e) => {
            e.preventDefault();
            void sendNudge();
          }}
        >
          <p className="text-sm text-foreground">
            An in-app notification and email to <strong className="font-semibold tabular-nums">{targetIds.length.toLocaleString("en-IN")}</strong> {targetIds.length === 1 ? "student" : "students"}. Nothing goes out until you press Send.
          </p>
          <label className="block text-sm">
            <span className="text-text-subtle">Title</span>
            <input required maxLength={200} value={nudge.title} onChange={(e) => setNudge({ ...nudge, title: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-ink-200 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring" />
          </label>
          <label className="block text-sm">
            <span className="text-text-subtle">Message</span>
            <textarea required maxLength={4000} rows={3} value={nudge.message} onChange={(e) => setNudge({ ...nudge, message: e.target.value })} className="mt-1 w-full rounded-xl border border-ink-200 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} onClick={() => setNudge(null)}>Cancel</button>
            <button type="submit" disabled={sending} className="inline-flex h-9 items-center rounded-full bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11">
              {sending ? "Sending" : "Send nudge"}
            </button>
          </div>
        </form>
      ) : null}

      {/* The list is a table: the columns picked above show here and go into the CSV. Name stays pinned on the left. */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {spec.rows.length === 0 ? (
          <div className="grid place-items-center gap-1 px-6 py-16 text-center">
            <span className="text-base font-medium text-foreground">{q ? `No one matches “${q}”` : "No one here right now"}</span>
            <span className="text-sm text-text-subtle">{q ? "Try a name, email, phone or college" : "When someone reaches this point they show up here"}</span>
          </div>
        ) : (
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm" aria-label={spec.title}>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-20 bg-background px-4 py-2.5 text-left text-xs font-medium text-text-subtle shadow-[inset_0_-1px_0_var(--color-ink-100)] sm:px-5">
                  {pinned ?? (spec.kind === "employers" ? "Company" : "Name")}
                </th>
                {shownCols.map((c) => (
                  <th key={c} scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-background px-3 py-2.5 text-left text-xs font-medium text-text-subtle shadow-[inset_0_-1px_0_var(--color-ink-100)]">
                    {c}
                  </th>
                ))}
                <th scope="col" className="sticky top-0 z-10 bg-background px-3 py-2.5 shadow-[inset_0_-1px_0_var(--color-ink-100)]">
                  <span className="sr-only">Reach out</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {spec.rows.slice(0, limit).map((r) => {
                const on = sel.has(r.id);
                const cell = cn("border-b border-ink-100 transition-colors", on ? "bg-brand-50" : "bg-background group-hover:bg-ink-50");
                return (
                  <tr key={r.id} className="group">
                    <td className={cn(cell, "sticky left-0 z-[1] px-4 py-2.5 sm:px-5")}>
                      <div className="flex w-[15rem] items-center gap-3 sm:w-[17rem]">
                        {/* The face is the checkbox: it turns into a tick when picked. */}
                        <label className="relative shrink-0 cursor-pointer rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
                          <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                          <span aria-hidden className={cn("grid size-9 place-items-center rounded-full text-xs font-semibold transition-all duration-200", on ? "scale-95 bg-brand-700 text-white" : "")} style={on ? undefined : tintOf(r.targetId)}>
                            {on ? <Check className="size-4" /> : initials(r.name)}
                          </span>
                        </label>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium text-foreground">
                              {r.href ? <Link href={r.href} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{r.name}</Link> : r.name}
                            </span>
                            {r.chip ? <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium", CHIP[r.chip.tone])}>{r.chip.label}</span> : null}
                          </div>
                          {r.note ? <div className="truncate text-xs text-text-subtle">{r.note}</div> : null}
                        </div>
                      </div>
                    </td>
                    {shownCols.map((c) => {
                      const v = r.csv[c];
                      const empty = v == null || v === "";
                      return (
                        <td key={c} className={cn(cell, "px-3 py-2.5 align-middle", PROSE.has(c) ? "min-w-[16rem] max-w-[22rem]" : "max-w-[16rem] whitespace-nowrap", empty ? "text-ink-400" : "text-foreground", typeof v === "number" && "tabular-nums")}>
                          {c === "Last seen" && v === "Online now" ? (
                            <span className="font-medium text-brand-700">Online now</span>
                          ) : empty ? (
                            "—"
                          ) : PROSE.has(c) ? (
                            // Sentences wrap to three lines; the whole text (feedback can be long) is in the tooltip and the CSV.
                            <span className={cn("whitespace-pre-line", c === "What happened" ? "line-clamp-2" : "line-clamp-3")} title={String(v)}>{String(v)}</span>
                          ) : (
                            <span className="block truncate">{String(v)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={cn(cell, "px-3 py-2.5")}>
                      <span className="flex items-center gap-0.5">
                        {r.phone ? (
                          <a href={`tel:${r.phone.replace(/\s/g, "")}`} aria-label={`Call ${r.name}`} className="grid size-8 place-items-center rounded-full text-ink-600 hover:bg-background hover:text-brand-700 touch:size-11">
                            <Phone className="size-4" aria-hidden />
                          </a>
                        ) : null}
                        {r.email ? (
                          <a href={`mailto:${r.email}`} aria-label={`Email ${r.name}`} className="grid size-8 place-items-center rounded-full text-ink-600 hover:bg-background hover:text-brand-700 touch:size-11">
                            <Mail className="size-4" aria-hidden />
                          </a>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {spec.rows.length > limit ? (
          <div className="sticky left-0 py-4 text-center">
            <button type="button" className={btn} onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, spec.rows.length - limit).toLocaleString("en-IN")} more of {(spec.rows.length - limit).toLocaleString("en-IN")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
