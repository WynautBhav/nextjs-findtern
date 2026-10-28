"use client";

/**
 * Broadcast composer.
 *
 * Candidates, companies or both; on each side either everyone active or a
 * picked list (legacy: "both" sends two batches, each side with its own
 * "All" switch). Type is free text as in legacy, with an optional in-app
 * link and the legacy `data` JSON for anything else.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Send } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Person = { id: string; label: string; email: string };
type Side = "intern" | "employer";

const field =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500/20";

export function NotificationComposer({
  interns,
  employers,
  totals,
  query: serverQuery = "",
}: {
  interns: Person[];
  employers: Person[];
  /** Active accounts per audience, for "send to everyone". */
  totals: { intern: number; employer: number };
  /** The search the roster was loaded with (`?q=`). */
  query?: string;
}) {
  const router = useRouter();
  const [audience, setAudience] = useState<"intern" | "employer" | "both">("intern");
  const [viewing, setViewing] = useState<Side>("intern");
  const [query, setQuery] = useState(serverQuery);
  const [picked, setPicked] = useState<Record<Side, Set<string>>>({ intern: new Set(), employer: new Set() });
  const [everyone, setEveryone] = useState<Record<Side, boolean>>({ intern: false, employer: false });
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("custom");
  const [link, setLink] = useState("");
  const [dataJson, setDataJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const sides: Side[] = audience === "both" ? ["intern", "employer"] : [audience];
  const side: Side = audience === "both" ? viewing : audience;
  const roster = side === "intern" ? interns : employers;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((p) => p.label.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [roster, query]);

  const countFor = (s: Side) => (everyone[s] ? totals[s] : picked[s].size);
  const total = sides.reduce((sum, s) => sum + countFor(s), 0);
  const allShownPicked = filtered.length > 0 && filtered.every((p) => picked[side].has(p.id));

  function toggle(id: string) {
    setSent(null);
    setPicked((prev) => {
      const next = new Set(prev[side]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [side]: next };
    });
  }

  function toggleShown() {
    setPicked((prev) => {
      const next = new Set(prev[side]);
      for (const p of filtered) {
        if (allShownPicked) next.delete(p.id);
        else next.add(p.id);
      }
      return { ...prev, [side]: next };
    });
  }

  async function send() {
    setSent(null);
    const empty = sides.find((s) => countFor(s) === 0);
    if (empty) {
      setError(
        audience === "both"
          ? `Pick at least one ${empty === "intern" ? "candidate" : "company"}, or tick Everyone on that side.`
          : "Pick at least one recipient, or tick Everyone.",
      );
      return;
    }
    if (!title.trim() || !message.trim()) {
      setError("A title and a message are both required.");
      return;
    }
    let data: Record<string, unknown> = {};
    if (dataJson.trim()) {
      try {
        const parsed: unknown = JSON.parse(dataJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        data = parsed as Record<string, unknown>;
      } catch {
        setError('Extra data must be a JSON object, for example {"proposalId": "…"}.');
        return;
      }
    }
    if (link.trim()) {
      if (!link.trim().startsWith("/") || link.trim().startsWith("//")) {
        setError("The link must be a path on this site, starting with / (for example /intern/proposals).");
        return;
      }
      data = { ...data, link: link.trim() };
    }

    setBusy(true);
    setError(null);
    try {
      const sideBody = (s: Side) =>
        sides.includes(s) ? { all: everyone[s], ids: everyone[s] ? [] : Array.from(picked[s]) } : { all: false, ids: [] };
      const res = await csrfFetch("/api/admin/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientType: audience,
          interns: sideBody("intern"),
          employers: sideBody("employer"),
          title: title.trim(),
          message: message.trim(),
          type,
          data,
        }),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string; interns?: number; employers?: number };
      if (!res.ok) throw new Error(result.error ?? "Could not send the notification.");
      const parts = [
        result.interns ? `${result.interns} ${result.interns === 1 ? "candidate" : "candidates"}` : null,
        result.employers ? `${result.employers} ${result.employers === 1 ? "company" : "companies"}` : null,
      ].filter(Boolean);
      setSent(`Sent to ${parts.join(" and ")}.`);
      setEveryone({ intern: false, employer: false });
      setPicked({ intern: new Set(), employer: new Set() });
      setTitle("");
      setMessage("");
      setLink("");
      setDataJson("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the notification.");
    } finally {
      setBusy(false);
    }
  }

  const segment = (active: boolean) =>
    cn(
      "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-apple-sm px-3 text-sm font-medium max-lg:min-h-11",
      active ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-800",
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section aria-labelledby="recipients-title" className="min-w-0 rounded-apple-xl border border-ink-200/80 bg-white p-5 shadow-xs">
        <h2 id="recipients-title" className="text-base font-semibold text-ink-900">
          Recipients
        </h2>
        <div role="group" aria-label="Audience" className="mt-3 flex gap-0.5 rounded-apple-sm bg-ink-100 p-1">
          {(["intern", "employer", "both"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={audience === value}
              onClick={() => {
                setAudience(value);
                if (value !== "both") setViewing(value);
              }}
              className={segment(audience === value)}
            >
              {value === "intern" ? "Candidates" : value === "employer" ? "Companies" : "Both"}
            </button>
          ))}
        </div>

        {audience === "both" ? (
          <div role="tablist" aria-label="Pick from" className="mt-3 flex gap-4 border-b border-ink-100">
            {(["intern", "employer"] as const).map((s) => (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={viewing === s}
                onClick={() => setViewing(s)}
                className={cn(
                  "-mb-px min-h-10 border-b-2 text-sm font-medium max-lg:min-h-11",
                  viewing === s ? "border-brand-700 text-ink-900" : "border-transparent text-ink-600 hover:text-ink-800",
                )}
              >
                {s === "intern" ? "Candidates" : "Companies"}{" "}
                <span className="nums text-ink-600">({everyone[s] ? "all" : picked[s].size})</span>
              </button>
            ))}
          </div>
        ) : null}

        <label className="mt-4 flex min-h-11 items-center gap-2.5 rounded-apple-sm border border-ink-200 px-3 text-sm font-medium text-ink-800">
          <input
            type="checkbox"
            className="size-4 accent-brand-700"
            checked={everyone[side]}
            onChange={(e) => setEveryone((prev) => ({ ...prev, [side]: e.target.checked }))}
          />
          Every active {side === "intern" ? "candidate" : "company"}
          <span className="nums ml-auto text-ink-600">{totals[side].toLocaleString("en-IN")}</span>
        </label>

        <fieldset disabled={everyone[side]} className="mt-3 disabled:opacity-50">
          <legend className="sr-only">Pick {side === "intern" ? "candidates" : "companies"}</legend>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email, Enter for everyone"
              aria-label="Search recipients"
              onKeyDown={(e) => {
                // Enter searches everyone on the server; typing filters the loaded list.
                if (e.key === "Enter") {
                  e.preventDefault();
                  const q = query.trim();
                  router.push(q ? `?q=${encodeURIComponent(q)}` : "?");
                }
              }}
              className={cn(field, "mt-0 pl-9")}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="nums text-ink-600">
              {picked[side].size} picked
            </span>
            <button type="button" onClick={toggleShown} disabled={filtered.length === 0} className={buttonClass({ variant: "ghost", size: "sm" })}>
              {allShownPicked ? "Clear shown" : "Pick all shown"}
            </button>
          </div>
          {roster.length >= 50 ? (
            <p className="mt-1 text-xs text-ink-600">Showing the 50 newest. Search and press Enter to find anyone else.</p>
          ) : null}
          <ul className="mt-2 max-h-80 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="py-4 text-sm text-ink-600">Nobody matches that search.</li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-apple-sm px-2 py-1.5 hover:bg-ink-50">
                    <input type="checkbox" checked={picked[side].has(p.id)} onChange={() => toggle(p.id)} className="size-4 shrink-0 accent-brand-700" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink-800">{p.label || p.email}</span>
                      <span className="block truncate text-xs text-ink-600">{p.email}</span>
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </fieldset>
      </section>

      <section aria-labelledby="message-title" className="min-w-0 rounded-apple-xl border border-ink-200/80 bg-white p-5 shadow-xs">
        <h2 id="message-title" className="text-base font-semibold text-ink-900">
          Message
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
          <div>
            <label htmlFor="notif-title" className="block text-sm font-medium text-ink-800">
              Title
            </label>
            <input id="notif-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Timesheets are open for this month" className={field} />
          </div>
          <div>
            <label htmlFor="notif-type" className="block text-sm font-medium text-ink-800">
              Type
            </label>
            <input id="notif-type" list="notif-types" value={type} maxLength={40} onChange={(e) => setType(e.target.value)} className={field} />
            <datalist id="notif-types">
              <option value="custom" />
              <option value="announcement" />
              <option value="update" />
              <option value="promo" />
              <option value="alert" />
              <option value="maintenance" />
            </datalist>
          </div>
        </div>

        <label htmlFor="notif-message" className="mt-4 block text-sm font-medium text-ink-800">
          Message
        </label>
        <textarea
          id="notif-message"
          value={message}
          maxLength={4000}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="What changed, and what they should do about it."
          className={cn(field, "py-2.5")}
        />

        <label htmlFor="notif-link" className="mt-4 block text-sm font-medium text-ink-800">
          Link <span className="font-normal text-ink-600">(optional)</span>
        </label>
        <input id="notif-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/intern/proposals" className={field} />
        <p className="mt-1 text-xs text-ink-600">A page on this site, saved as the notification&apos;s link (data.link).</p>

        <details className="mt-4 rounded-apple-sm border border-ink-200/80 px-3.5 py-2.5">
          <summary className="cursor-pointer text-sm font-medium text-ink-800">Extra data (JSON, advanced)</summary>
          <textarea
            aria-label="Extra data as JSON"
            value={dataJson}
            onChange={(e) => setDataJson(e.target.value)}
            rows={3}
            placeholder='{"proposalId": "…"}'
            className={cn(field, "py-2.5 font-mono")}
          />
          <p className="mt-1 text-xs text-ink-600">Stored on the notification as legacy did. Leave empty if unsure.</p>
        </details>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={send} disabled={busy} className={buttonClass({ variant: "primary" })}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            Send to <span className="nums">{total.toLocaleString("en-IN")}</span>
          </button>
          <p className="text-sm text-ink-600">Shows in each recipient&apos;s bell. Nothing is emailed.</p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p role="status" className="mt-3 text-sm font-medium text-brand-700">
            {sent}
          </p>
        ) : null}
      </section>
    </div>
  );
}
