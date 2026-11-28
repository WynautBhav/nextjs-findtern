"use client";

import { ArrowUpRight, Bell, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useConfirm } from "@/components/app/use-confirm";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { csrfFetch } from "@/lib/client-fetch";
import { FOLLOW_UP_NOTE_MAX, historyText, type CallNo } from "@/lib/admin/follow-ups";
import { HEAT_LABEL, TAB_TARGET, nudgeBreakdown, type AnyRow, type ColumnDef, type TabKey } from "@/lib/admin/master-data-pure";
import { istStamp } from "@/lib/college/master-row";
import { cn } from "@/lib/utils";

import { FollowUpMarks } from "./follow-up-marks";

type History = { status: string; note: string | null; at: string; by: string | null }[];

const FIELD = "w-full rounded-xl border border-ink-200 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
const BTN = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 touch:h-11";
const HIDE = new Set(["name", "company", "heat", "followUp", "followUpNote", "followUpAt"]);

export type DrawerRecord = { row: AnyRow; title: string; sub: string; href: string | null };

/**
 * One record, every field: why it is hot, its follow-up marks (Nudge automatic; Call 1 and Call 2 ticked here with an
 * optional note, each a new log row), its nudges (TPO and Findtern) and the call history. Side sheet with the dashboard drawer's deep green head.
 */
export function RecordDrawer({ tab, record, columns, canWrite, canNudge, onClose }: { tab: TabKey; record: DrawerRecord | null; columns: ColumnDef<AnyRow>[]; canWrite: boolean; canNudge: boolean; onClose: () => void }) {
  return (
    <Sheet open={record !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent side="right" showCloseButton={false} className="flex w-full flex-col gap-0 overflow-hidden border-0 bg-background p-0 sm:max-w-[30rem]">
        {record ? <Body key={record.row.id} tab={tab} record={record} columns={columns} canWrite={canWrite} canNudge={canNudge} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({ tab, record, columns, canWrite, canNudge }: { tab: TabKey; record: DrawerRecord; columns: ColumnDef<AnyRow>[]; canWrite: boolean; canNudge: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const { row } = record;
  const target = TAB_TARGET[tab];
  const fu = row.followUp;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<{ title: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    csrfFetch(`/api/admin/follow-ups?type=${target}&id=${encodeURIComponent(row.id)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 403 ? "Your role can't see this history." : j.error ?? `History didn't load (${r.status}).`);
        return j as { history: History };
      })
      .then((j) => { if (live) { setHistory(j.history); setHistoryError(null); } })
      .catch((e: unknown) => { if (live) { setHistory(null); setHistoryError(e instanceof Error && !/fetch/i.test(e.message) ? e.message : "History didn't load. Check your connection."); } });
    return () => { live = false; };
  }, [target, row.id, reload]);

  async function setCall(call: CallNo, done: boolean) {
    if (!done && !(await ask({ title: `Undo Call ${call}?`, body: "The tick is removed. The history keeps both steps.", confirmLabel: `Undo Call ${call}`, destructive: false }))) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await csrfFetch("/api/admin/follow-ups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: target, targetId: row.id, call, done, note: note.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg({ text: j.error ?? "Not saved. Try again.", bad: true });
      setMsg({ text: `Call ${call} ${done ? "marked done" : "undone"}.`, bad: false });
      setNote("");
      setReload((n) => n + 1);
      router.refresh();
    } catch {
      setMsg({ text: "Network problem. Nothing was saved.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function sendNudge(e: React.FormEvent) {
    e.preventDefault();
    if (!nudge) return;
    const ok = await ask({ title: `Nudge ${record.title}?`, body: "They get an in-app notification and its email now.", confirmLabel: "Send nudge", destructive: false });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const side = { all: false, ids: [row.id] };
      const res = await csrfFetch("/api/admin/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(tab === "students" ? { interns: side } : { employers: side }), title: nudge.title, message: nudge.message, type: "nudge", data: {} }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg({ text: j.error ?? `Not sent (${res.status}).`, bad: true });
      setMsg({ text: Number(j.count) > 0 ? "Nudge sent." : "Not sent: this account is switched off.", bad: Number(j.count) === 0 });
      setNudge(null);
      router.refresh();
    } catch {
      setMsg({ text: "Network problem. Nothing was sent.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  const facts = columns.filter((c) => !HIDE.has(c.key));
  const nudges = "nudges" in row ? row.nudges : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {dialog}
      <header className="bg-[#0a3a2c] px-5 pb-5 pt-5 text-[#f2faf6] sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SheetTitle className="text-balance text-xl font-medium leading-snug tracking-[-0.01em] text-[#f2faf6]">{record.title}</SheetTitle>
            <SheetDescription className="mt-0.5 truncate text-sm text-[#a9cbbd]">{record.sub}</SheetDescription>
          </div>
          <SheetClose className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-[#f2faf6] transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:size-11">
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="nums text-[2rem] font-semibold leading-none tracking-[-0.03em]">{row.heat.score}</span>
          <span className="font-medium">{HEAT_LABEL[row.heat.level]}</span>
          <span className="text-[#a9cbbd]">{row.heat.why}</span>
        </p>
        {record.href ? (
          <Link href={record.href} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-medium text-[#f2faf6] transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white touch:h-11">
            Open full record <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
        {msg ? <p role={msg.bad ? "alert" : "status"} className={cn("rounded-xl px-3 py-2 text-sm", msg.bad ? "bg-[color:var(--color-danger)]/10 text-[color:var(--color-danger)]" : "bg-brand-50 text-brand-800")}>{msg.text}</p> : null}

        <section aria-labelledby="fu-head">
          <h3 id="fu-head" className="text-base font-semibold text-foreground">Follow-up</h3>
          <div className="mt-3"><FollowUpMarks f={fu} canWrite={false} busy={false} onToggle={() => undefined} name={record.title} /></div>
          {canWrite ? (
            <form onSubmit={(e) => { e.preventDefault(); const n: CallNo | null = !fu.call1 ? 1 : !fu.call2 ? 2 : null; if (n) void setCall(n, true); }} className="mt-4 space-y-3">
              <label className="block text-sm text-text-subtle">
                Call note (optional)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={FOLLOW_UP_NOTE_MAX} rows={3} aria-describedby="fu-count" placeholder="What was said, what happens next" className={cn(FIELD, "mt-1 py-2")} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span id="fu-count" className="nums text-xs text-text-subtle">{note.length} of {FOLLOW_UP_NOTE_MAX}</span>
                <span className="flex flex-wrap gap-2">
                  {fu.call1 ? (
                    <button type="button" disabled={busy} onClick={() => void setCall(fu.call2 ? 2 : 1, false)} className={cn(BTN, "border border-ink-200 text-foreground hover:bg-[color:var(--admin-panel-2)]")}>Undo Call {fu.call2 ? 2 : 1}</button>
                  ) : null}
                  {!fu.call2 ? (
                    <button type="submit" disabled={busy} className={cn(BTN, "bg-primary text-white hover:bg-primary-hover")}>{busy ? "Saving…" : `Mark Call ${fu.call1 ? 2 : 1} done`}</button>
                  ) : null}
                </span>
              </div>
            </form>
          ) : null}
        </section>

        {nudges ? (
          <section aria-labelledby="nudge-head">
            <div className="flex items-center justify-between gap-3">
              <h3 id="nudge-head" className="text-base font-semibold text-foreground">Nudges</h3>
              {canNudge && !nudge ? (
                <button type="button" onClick={() => setNudge({ title: "A quick nudge from Findtern", message: "" })} className={cn(BTN, "h-9 border border-ink-200 px-3 text-foreground hover:bg-[color:var(--admin-panel-2)]")}>
                  <Bell className="size-4" aria-hidden /> Nudge
                </button>
              ) : null}
            </div>
            <p className="nums mt-1.5 text-sm text-foreground">{nudgeBreakdown(nudges)}{nudges.last ? <span className="text-text-subtle"> · last {istStamp(nudges.last)}</span> : null}</p>
            {nudge ? (
              <form onSubmit={sendNudge} className="mt-3 space-y-3">
                <label className="block text-sm text-text-subtle">Title<input required maxLength={200} value={nudge.title} onChange={(e) => setNudge({ ...nudge, title: e.target.value })} className={cn(FIELD, "mt-1 h-10")} /></label>
                <label className="block text-sm text-text-subtle">Message<textarea required maxLength={4000} rows={3} value={nudge.message} onChange={(e) => setNudge({ ...nudge, message: e.target.value })} className={cn(FIELD, "mt-1 py-2")} /></label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setNudge(null)} className={cn(BTN, "text-foreground hover:bg-[color:var(--admin-panel-2)]")}>Cancel</button>
                  <button type="submit" disabled={busy} className={cn(BTN, "bg-primary text-white hover:bg-primary-hover")}>Send nudge</button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="facts-head">
          <h3 id="facts-head" className="text-base font-semibold text-foreground">Details</h3>
          <dl className="mt-2 divide-y divide-[color:var(--admin-rule)] text-sm">
            {facts.map((c) => {
              const v = c.text(row);
              return (
                <div key={c.key} className="grid grid-cols-[7rem_1fr] gap-3 py-2 sm:grid-cols-[9.5rem_1fr]">
                  <dt className="text-text-subtle">{c.label}</dt>
                  <dd className={cn("nums min-w-0 break-words", v ? "text-foreground" : "text-text-subtle")}>{v || "-"}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <section aria-labelledby="hist-head">
          <h3 id="hist-head" className="text-base font-semibold text-foreground">History</h3>
          {historyError ? (
            <p role="alert" className="mt-2 text-sm text-[color:var(--color-danger)]">
              {historyError}{" "}
              <button type="button" onClick={() => { setHistoryError(null); setReload((n) => n + 1); }} className="font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Try again</button>
            </p>
          ) : history === null ? (
            <p className="mt-2 text-sm text-text-subtle">Loading…</p>
          ) : history.length === 0 ? (
            <p className="mt-2 text-sm text-text-subtle">No calls yet.</p>
          ) : (
            <ol className="mt-2 space-y-3">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="rounded-xl bg-[color:var(--admin-panel-2)] px-3 py-2.5 text-sm">
                  <p className="nums font-medium text-foreground">{historyText(h)}</p>
                  {h.note ? <p className="mt-1 whitespace-pre-line break-words text-foreground">{h.note}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

