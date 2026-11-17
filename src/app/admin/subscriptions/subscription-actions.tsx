"use client";

/**
 * Grant and revoke Findtern Pro access. One dialog each. Both write a note that is kept with the action, both are safe to
 * press twice (the server answers a repeat with "already done"), and neither moves money. The result is announced in a
 * polite live region, then the list is refreshed. `GrantAccessButton` is the page-level entry: it first finds the company.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { csrfFetch } from "@/lib/client-fetch";
import { addIstDays, GRANT_MAX_DAYS, istToday } from "@/lib/subscription/grant";
import { cn } from "@/lib/utils";

const field =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle aria-invalid:border-danger";

type Company = { id: string; name: string };

const NOTICE_EVENT = "subscriptions:notice";
const announce = (text: string) => window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: text }));

/** The page's one live region: what the last grant or revoke did. Stays until the next action or a reload. */
export function SubscriptionNotice() {
  const [text, setText] = useState("");
  useEffect(() => {
    const on = (e: Event) => setText(String((e as CustomEvent).detail ?? ""));
    window.addEventListener(NOTICE_EVENT, on);
    return () => window.removeEventListener(NOTICE_EVENT, on);
  }, []);
  return (
    <div role="status" aria-live="polite" className={text ? "mb-4 rounded-apple-sm bg-success-soft px-4 py-3 text-sm font-medium text-success" : "sr-only"}>
      {text}
    </div>
  );
}

async function post(path: string, body: unknown): Promise<{ ok: true; unchanged: boolean } | { ok: false; error: string }> {
  try {
    const res = await csrfFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "That did not work. Nothing was changed." };
    return { ok: true, unchanged: data.unchanged === true };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Nothing was changed. Try again." };
  }
}

export function GrantDialog({ company, open, onOpenChange, onDone }: { company: Company | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: (text: string) => void }) {
  const today = istToday();
  const [until, setUntil] = useState(() => addIstDays(today, 365));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const ids = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const r = await post("/api/admin/subscriptions/grant", { employerId: company.id, until, note });
    inFlight.current = false;
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onOpenChange(false);
    setNote("");
    onDone(r.unchanged ? `${company.name} already has access until that day. Nothing changed.` : `Access granted to ${company.name}. No payment was taken.`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Findtern Pro access</DialogTitle>
          <DialogDescription>
            {company ? `${company.name} gets the CGPA filter and the college filter and sort until the last day you choose. ` : ""}
            No payment is taken and no invoice is made.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor={`${ids}-until`} className="block text-sm font-semibold text-ink-800">Access until <span className="font-normal text-ink-600">(required)</span></label>
            <input id={`${ids}-until`} type="date" required min={addIstDays(today, 1)} max={addIstDays(today, GRANT_MAX_DAYS)} value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
            <p className="mt-1.5 text-sm text-ink-700" aria-live="polite">
              {until ? `Access ends at the end of ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${until}T00:00:00Z`))}, India time.` : "Pick the last day of access."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[{ l: "30 days from today", d: 30 }, { l: "90 days from today", d: 90 }, { l: "1 year from today", d: 365 }].map((p) => (
                <button key={p.d} type="button" onClick={() => setUntil(addIstDays(today, p.d))} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 rounded-full" })}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor={`${ids}-note`} className="block text-sm font-semibold text-ink-800">Note <span className="font-normal text-ink-600">(required, kept with the audit log)</span></label>
            <textarea id={`${ids}-note`} required rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is access being granted? e.g. Pilot customer, agreed with sales" aria-invalid={error ? true : undefined} aria-describedby={error ? `${ids}-err` : undefined} className={cn(field, "resize-y py-2")} />
          </div>
          {error ? <p id={`${ids}-err`} role="alert" className="rounded-apple-sm bg-danger-soft p-3 text-sm font-medium text-danger">{error}</p> : null}
          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={buttonClass({ variant: "ghost", size: "md" })}>Cancel</button>
            <button type="submit" disabled={busy || !company || note.trim().length < 3} className={buttonClass({ variant: "primary", size: "md" })}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Grant access
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeDialog({ company, open, onOpenChange, onDone }: { company: Company | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: (text: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const ids = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const r = await post("/api/admin/subscriptions/revoke", { employerId: company.id, note });
    inFlight.current = false;
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onOpenChange(false);
    setNote("");
    onDone(r.unchanged ? `${company.name} was already revoked. Nothing changed.` : `Access revoked for ${company.name}. No money was moved.`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke Findtern Pro access</DialogTitle>
          <DialogDescription>
            {company ? `${company.name} loses the CGPA filter and the college filter and sort now. ` : ""}
            Payments made so far stop counting toward access. No refund is made and no payment record is changed. A later payment or grant starts access again.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor={`${ids}-note`} className="block text-sm font-semibold text-ink-800">Note <span className="font-normal text-ink-600">(required, kept with the audit log)</span></label>
            <textarea id={`${ids}-note`} required rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is access being revoked? e.g. Chargeback, refund issued outside the app" aria-invalid={error ? true : undefined} aria-describedby={error ? `${ids}-err` : undefined} className={cn(field, "resize-y py-2")} />
          </div>
          {error ? <p id={`${ids}-err`} role="alert" className="rounded-apple-sm bg-danger-soft p-3 text-sm font-medium text-danger">{error}</p> : null}
          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className={buttonClass({ variant: "ghost", size: "md" })}>Cancel</button>
            <button type="submit" disabled={busy || !company || note.trim().length < 3} className={cn(buttonClass({ variant: "primary", size: "md" }), "bg-danger hover:bg-danger")}>
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              Revoke access
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Row buttons: Grant (extend or reinstate) and, while access is live, Revoke. */
export function RowActions({ company, canRevoke, grantLabel }: { company: Company; canRevoke: boolean; grantLabel: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"grant" | "revoke" | null>(null);
  const done = (text: string) => {
    announce(text);
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={() => setDialog("grant")} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 rounded-full" })}>
        {grantLabel}
        <span className="sr-only"> for {company.name}</span>
      </button>
      {canRevoke ? (
        <button type="button" onClick={() => setDialog("revoke")} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 rounded-full text-danger hover:bg-danger-soft" })}>
          Revoke<span className="sr-only"> access for {company.name}</span>
        </button>
      ) : null}
      <GrantDialog company={company} open={dialog === "grant"} onOpenChange={(o) => setDialog(o ? "grant" : null)} onDone={done} />
      <RevokeDialog company={company} open={dialog === "revoke"} onOpenChange={(o) => setDialog(o ? "revoke" : null)} onDone={done} />
    </div>
  );
}

/** Page-level entry: find the company first, then the same grant dialog. */
export function GrantAccessButton() {
  const router = useRouter();
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const ids = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      setSearching(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error("search");
        const data = (await res.json()) as { companies?: { id: string; label: string; sublabel: string }[] };
        setResults((data.companies ?? []).map((c) => ({ id: c.id, name: c.sublabel ? `${c.label} (${c.sublabel})` : c.label })));
      } catch {
        setFailed(true);
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <button type="button" onClick={() => setPick(true)} className={buttonClass({ variant: "primary", size: "md", className: ADMIN_PILL_PRIMARY })}>
        <Plus className="size-4" aria-hidden />
        Grant access
      </button>

      <Dialog open={pick} onOpenChange={setPick}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Findtern Pro access</DialogTitle>
            <DialogDescription>Find the company by name or email.</DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor={`${ids}-q`} className="block text-sm font-semibold text-ink-800">Company</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 mt-0.5 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
              <input id={`${ids}-q`} type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name or email" className={cn(field, "pl-9")} />
            </div>
            <div role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-text-subtle">
              {searching ? "Searching…" : failed ? "Search failed. Try again." : results && q.trim().length >= 2 && results.length === 0 ? "No company matches." : q.trim().length < 2 ? "Type at least 2 letters." : ""}
            </div>
            {results && results.length > 0 && q.trim().length >= 2 ? (
              <ul className="mt-1 max-h-60 divide-y divide-ink-100 overflow-auto rounded-apple-sm border border-ink-200">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCompany(c);
                        setPick(false);
                      }}
                      className="min-h-11 w-full break-words px-3 py-2 text-left text-sm text-ink-900 hover:bg-ink-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <GrantDialog
        company={company}
        open={company !== null && !pick}
        onOpenChange={(o) => {
          if (!o) setCompany(null);
        }}
        onDone={(text) => {
          setCompany(null);
          announce(text);
          router.refresh();
        }}
      />
    </>
  );
}
