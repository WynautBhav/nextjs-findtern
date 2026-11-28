"use client";

import { Bell, Columns3, Copy, Download, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/**
 * The list behind any number on the dashboard: select rows, copy, email (bcc), call one, nudge students (manual, after
 * a confirm; an in-app notification and its email), export CSV with a column picker. Rows are people (students) or
 * companies; `note` carries the offer or meeting the row is about.
 */

export type DrawerRow = {
  id: string;
  /** The person or company the row opens and the actions reach. */
  targetId: string;
  name: string;
  sub: string;
  note?: string;
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

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // A leading = + - @ would run as a formula in a spreadsheet.
  // A leading = + - @ would run as a formula in a spreadsheet; a phone number ("+91 98765 43210") is left as it is.
  const safe = /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s()-]+$/.test(s)) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function download(name: string, rows: (string | number | null)[][]) {
  const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
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
    <Sheet open={spec !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        {spec ? <DrawerBody key={spec.title + spec.rows.length} spec={spec} canNudge={canNudge} onToast={onToast} /> : null}
      </SheetContent>
    </Sheet>
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
  const spec = useMemo(() => (tab === "wait" && full.waitingIds ? { ...full, rows: full.rows.filter((r) => full.waitingIds!.has(r.id)) } : full), [full, tab]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const columns = useMemo(() => Object.keys(full.rows[0]?.csv ?? {}), [full.rows]);
  const [cols, setCols] = useState<Set<string>>(() => new Set(columns));
  const [colOpen, setColOpen] = useState(false);
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
    if (!target.length || cols.size === 0) return;
    const keep = columns.filter((c) => cols.has(c));
    download(spec.filename, [keep, ...target.map((r) => keep.map((c) => r.csv[c] ?? ""))]);
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
  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 px-3 text-sm text-foreground transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:opacity-45 touch:h-11";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-ink-200 px-5 pb-4 pt-5 pr-14">
        <SheetTitle className="text-lg font-semibold leading-snug text-foreground">{spec.title}</SheetTitle>
        <SheetDescription className="mt-0.5 text-sm text-text-subtle">{full.sub}</SheetDescription>
        {full.waitingIds ? (
          <div role="group" aria-label="Which people" className="mt-3 inline-flex rounded-full bg-ink-100 p-0.5">
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
                  "h-8 rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11",
                  tab === k ? "bg-background font-medium text-foreground shadow-sm" : "text-text-subtle hover:text-foreground",
                )}
              >
                {l} <span className="tabular-nums">{c.toLocaleString("en-IN")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="relative flex flex-wrap items-center gap-2 border-b border-ink-200 px-5 py-3">
        <label className="mr-auto inline-flex items-center gap-2 text-sm text-text-subtle">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-brand-700)]"
            checked={allOn}
            onChange={() => setSel(allOn ? new Set() : new Set(spec.rows.map((r) => r.id)))}
            aria-label="Select everyone in this list"
          />
          <span className="tabular-nums">{picked.length ? `${picked.length.toLocaleString("en-IN")} selected` : `${spec.rows.length.toLocaleString("en-IN")} in list`}</span>
        </label>
        <button type="button" className={btn} onClick={copy} aria-disabled={!target.length} title={`Copy name, email and phone of ${scope}`}>
          <Copy className="size-4" aria-hidden />
          Copy
        </button>
        <a className={btn} href={emails.length ? mailto : undefined} aria-disabled={!emails.length} title={`Email ${scope}`}>
          <Mail className="size-4" aria-hidden />
          Email
        </a>
        <a className={btn} href={one?.phone ? `tel:${one.phone.replace(/\s/g, "")}` : undefined} aria-disabled={!one?.phone} title={one ? "Call" : "Select one to call"}>
          <Phone className="size-4" aria-hidden />
          Call
        </a>
        {spec.kind === "students" && canNudge ? (
          <button
            type="button"
            className={btn}
            aria-disabled={!targetIds.length}
            onClick={() => (targetIds.length ? setNudge({ title: "A quick nudge from Findtern", message: "" }) : null)}
            title={`Nudge ${scope}`}
          >
            <Bell className="size-4" aria-hidden />
            Nudge
          </button>
        ) : null}
        <button type="button" className={cn(btn, "px-2.5")} onClick={() => setColOpen((o) => !o)} aria-expanded={colOpen} aria-label="Choose export columns">
          <Columns3 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={exportCsv}
          aria-disabled={!target.length || cols.size === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:pointer-events-none aria-disabled:opacity-45 touch:h-11"
        >
          <Download className="size-4" aria-hidden />
          CSV
        </button>
        {colOpen ? (
          <fieldset className="w-full rounded-xl border border-ink-200 p-3">
            <legend className="px-1 text-xs text-text-subtle">Columns in the CSV</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {columns.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-brand-700)]"
                    checked={cols.has(c)}
                    onChange={() =>
                      setCols((s) => {
                        const n = new Set(s);
                        if (n.has(c)) n.delete(c);
                        else n.add(c);
                        return n;
                      })
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      <p role={notice?.bad ? "alert" : "status"} className={cn("px-5 text-sm", notice ? "py-2" : "sr-only", notice?.bad ? "bg-[#fdecec] text-[#9b1c1c]" : "bg-brand-50 text-brand-800")}>
        {notice?.text ?? ""}
      </p>

      {nudge ? (
        <form
          className="space-y-3 border-b border-ink-200 bg-accent-100/50 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void sendNudge();
          }}
        >
          <p className="text-sm text-foreground">
            Send an in-app notification and email to <strong className="font-semibold tabular-nums">{targetIds.length.toLocaleString("en-IN")}</strong>{" "}
            {targetIds.length === 1 ? "student" : "students"}. Nothing is sent until you press Send.
          </p>
          <label className="block text-sm">
            <span className="text-text-subtle">Title</span>
            <input
              required
              maxLength={200}
              value={nudge.title}
              onChange={(e) => setNudge({ ...nudge, title: e.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-ink-200 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-subtle">Message</span>
            <textarea
              required
              maxLength={4000}
              rows={3}
              value={nudge.message}
              onChange={(e) => setNudge({ ...nudge, message: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} onClick={() => setNudge(null)}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm text-white hover:bg-primary-hover disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:h-11"
            >
              {sending ? "Sending" : "Send nudge"}
            </button>
          </div>
        </form>
      ) : null}

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5" aria-label={spec.title}>
        {spec.rows.length === 0 ? <li className="py-12 text-center text-sm text-text-subtle">No one here right now</li> : null}
        {spec.rows.slice(0, limit).map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-ink-100 py-2.5 last:border-b-0">
            <input type="checkbox" className="size-4 shrink-0 accent-[var(--color-brand-700)]" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {r.href ? (
                  <Link href={r.href} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </div>
              <div className="truncate text-xs text-text-subtle">{r.note ? `${r.note} · ${r.sub}` : r.sub}</div>
            </div>
            {r.chip ? <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", CHIP[r.chip.tone])}>{r.chip.label}</span> : null}
            <span className="flex shrink-0 items-center">
              {r.phone ? (
                <a href={`tel:${r.phone.replace(/\s/g, "")}`} aria-label={`Call ${r.name}`} className="grid size-8 place-items-center rounded-full text-ink-600 hover:bg-ink-100 touch:size-11">
                  <Phone className="size-4" aria-hidden />
                </a>
              ) : null}
              {r.email ? (
                <a href={`mailto:${r.email}`} aria-label={`Email ${r.name}`} className="grid size-8 place-items-center rounded-full text-ink-600 hover:bg-ink-100 touch:size-11">
                  <Mail className="size-4" aria-hidden />
                </a>
              ) : null}
            </span>
          </li>
        ))}
        {spec.rows.length > limit ? (
          <li className="py-4 text-center">
            <button type="button" className={btn} onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, spec.rows.length - limit).toLocaleString("en-IN")} more of {(spec.rows.length - limit).toLocaleString("en-IN")}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
