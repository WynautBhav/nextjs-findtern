"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check, ListChecks, MousePointerClick, X } from "lucide-react";

import { Initials } from "@/components/college/kit";

import { EmptyScene, Pill, Surface, type Tone } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { yearLabel } from "@/lib/college/labels";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export type ApprovalCandidate = {
  userId: string;
  name: string;
  email: string;
  source: "requested" | "list" | "college_email";
  rollNo: string | null;
  year: number | null;
  branch: string | null;
  accountSince: string | null;
};
/** Admin only: a match the officer is not offered (phone under another email, or a list email whose name differs). */
export type ReviewRow = { userId: string; kind: "phone" | "name"; listName: string; listEmail: string; accountName: string; accountEmail: string; phoneLast4: string | null };
export type RemovedRow = { userId: string; name: string; email: string; decidedAt: string | null; note: string | null };

const MAX_BATCH = 100;

/** Why this account is offered: the proof, in words, so the officer never accepts on a guess. */
const SOURCE: Record<ApprovalCandidate["source"], { label: string; why: string; tone: Tone; icon: React.ReactNode }> = {
  list: { label: "On the student list", why: "Same name and email as a row on the student list", tone: "live", icon: <ListChecks aria-hidden /> },
  college_email: { label: "College email", why: "Signed up with a verified college email address", tone: "new", icon: <AtSign aria-hidden /> },
  requested: { label: "Picked this college", why: "Chose this college on Findtern, without a code", tone: "waiting", icon: <MousePointerClick aria-hidden /> },
};

/**
 * Students who already have a Findtern account and look like this college's. The officer accepts or denies;
 * the server re-checks every id against its own list, so this component only ever proposes.
 * `endpoint` differs for the Findtern admin's copy of the same board.
 */
export function ApprovalsBoard({ candidates, removed, reviews = [], endpoint = "/api/college/students/decide", readOnly = false }: { candidates: ApprovalCandidate[]; removed: RemovedRow[]; reviews?: ReviewRow[]; endpoint?: string; readOnly?: boolean }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ids = useMemo(() => candidates.map((c) => c.userId), [candidates]);
  const chosen = ids.filter((id) => picked.has(id));
  // One request carries at most 100 students (the API's limit), so "select all" takes the first 100.
  const batch = ids.slice(0, MAX_BATCH);
  const allPicked = batch.length > 0 && batch.every((id) => picked.has(id));

  async function send(userIds: string[], action: "accept" | "deny" | "restore", key: string) {
    setError(null);
    setDone(null);
    setBusy(key);
    try {
      const res = await csrfFetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds, action }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; done?: number; failed?: number };
      if (!res.ok) {
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      const n = data.done ?? userIds.length;
      const word = action === "accept" ? "added to the college's students" : action === "deny" ? "removed" : "added back";
      setDone(`${n} ${n === 1 ? "student" : "students"} ${word}.${data.failed ? ` ${data.failed} could not be changed; refresh to see why.` : ""}`);
      setPicked(new Set());
      router.refresh();
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function deny(c: ApprovalCandidate) {
    const ok = await ask({
      title: `Deny ${c.name || c.email}?`,
      body: "They will not be shown as your student and cannot join your college with a code. You can add them back later from the removed list.",
      confirmLabel: "Yes, deny",
      destructive: true,
    });
    if (ok) await send([c.userId], "deny", c.userId);
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="rounded-apple-sm border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div role="status" aria-live="polite">
        {done ? <p className="rounded-apple-sm border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">{done}</p> : null}
      </div>

      <Surface className="overflow-hidden">
        {candidates.length === 0 ? (
          <EmptyScene
            compact
            title="Nobody is waiting"
            body="When a student who already has a Findtern account matches your student list or uses a college email, they appear here for you to accept or deny."
            next={endpoint.startsWith("/api/college/") ? { label: "Add your student list", href: "#add" } : undefined}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink-800">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(batch))}
                />
                {chosen.length ? `${chosen.length} selected` : ids.length > MAX_BATCH ? `Select the first ${MAX_BATCH} of ${ids.length}` : `Select all ${ids.length}`}
              </label>
              <button type="button" className={buttonClass({  })} disabled={chosen.length === 0 || busy !== null || readOnly} onClick={() => send(chosen.slice(0, MAX_BATCH), "accept", "bulk")}>
                {busy === "bulk" ? "Adding…" : chosen.length ? `Accept ${chosen.length}` : "Accept selected"}
              </button>
            </div>
            <ul className="grid gap-px bg-ink-100 md:grid-cols-2 md:[&>li:last-child:nth-child(odd)]:col-span-2">
              {candidates.map((c, i) => {
                const on = picked.has(c.userId);
                return (
                  <li key={c.userId} className={cn("rise flex flex-col gap-4 bg-white p-5 transition-colors", on && "bg-brand-50/60")} style={{ "--i": i } as React.CSSProperties}>
                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                      <input type="checkbox" className="mt-3 size-4 shrink-0 accent-brand-700" checked={on} onChange={() => toggle(c.userId)} aria-label={`Select ${c.name || c.email}`} />
                      <Initials seed={c.userId} name={c.name || c.email} className="size-11 text-sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-semibold text-ink-900">{c.name || c.email}</span>
                        <span className="block break-all text-sm text-ink-600">{c.email}</span>
                        <span className="mt-0.5 block text-xs text-text-subtle">
                          {[c.rollNo, c.year ? yearLabel(c.year) : null, c.branch, c.accountSince ? `On Findtern since ${formatDate(c.accountSince)}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-3 pl-7">
                      <Pill tone={SOURCE[c.source].tone} icon={SOURCE[c.source].icon}>{SOURCE[c.source].why}</Pill>
                      <span className="flex shrink-0 gap-2">
                        <button type="button" className={buttonClass({ size: "sm" })} disabled={busy !== null || readOnly} onClick={() => send([c.userId], "accept", c.userId)} aria-label={`Accept ${c.name || c.email}`}>
                          <Check aria-hidden /> {busy === c.userId ? "Saving…" : "Accept"}
                        </button>
                        <button type="button" className={buttonClass({ size: "sm", variant: "outline" })} disabled={busy !== null || readOnly} onClick={() => deny(c)} aria-label={`Deny ${c.name || c.email}`}>
                          <X aria-hidden /> Deny
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Surface>

      {reviews.length > 0 ? (
        <Surface className="overflow-hidden">
          <div className="border-b border-ink-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Needs your check <span className="nums font-normal text-text-subtle">({reviews.length})</span></h3>
            <p className="mt-0.5 text-sm text-text-subtle">The college&apos;s list and the Findtern account do not fully agree, so the placement officer is not shown these. Accept only when both sides are clearly the same person.</p>
          </div>
          <ul className="divide-y divide-ink-100">
            {reviews.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="grid min-w-0 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                  <span className="min-w-0"><span className="block text-xs text-text-subtle">College&apos;s list</span><span className="block font-medium text-ink-900">{m.listName || "No name"}</span><span className="block break-all text-ink-600">{m.listEmail}</span></span>
                  <span className="min-w-0"><span className="block text-xs text-text-subtle">Findtern account · {m.kind === "phone" ? `same phone (ends ${m.phoneLast4}), different email` : "same email, different name"}</span><span className="block font-medium text-ink-900">{m.accountName || "No name"}</span><span className="block break-all text-ink-600">{m.accountEmail}</span></span>
                </span>
                <button type="button" className={buttonClass({ size: "sm" })} disabled={busy !== null || readOnly} onClick={() => send([m.userId], "accept", m.userId)}>
                  {busy === m.userId ? "Saving…" : "Same person, accept"}
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {removed.length > 0 ? (
        <details className="group rounded-apple-xl border border-ink-200/80 bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-sm font-semibold text-ink-900 hover:bg-ink-50">
            <span>Removed by you <span className="nums font-normal text-text-subtle">({removed.length})</span></span>
            <span aria-hidden className="font-medium text-brand-700 group-open:hidden">Show</span>
          </summary>
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {removed.map((r) => (
              <li key={r.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block font-medium text-ink-900">{r.name || r.email}</span>
                  <span className="block break-all text-sm text-text-subtle">
                    {r.email}
                    {r.decidedAt ? ` · removed ${formatDate(r.decidedAt)}` : ""}
                  </span>
                </span>
                <button type="button" className={buttonClass({ size: "sm", variant: "outline" })} disabled={busy !== null || readOnly} onClick={() => send([r.userId], "restore", r.userId)}>
                  {busy === r.userId ? "Saving…" : "Add back"}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {dialog}
    </div>
  );
}
