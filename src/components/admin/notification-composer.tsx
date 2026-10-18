"use client";

/**
 * Broadcast composer.
 *
 * One message to picked people, or to every active account of one type
 * (the count is shown before sending).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

type Person = { id: string; label: string; email: string };

export function NotificationComposer({
  interns,
  employers,
  totals,
}: {
  interns: Person[];
  employers: Person[];
  /** Active accounts per audience, for "send to everyone". */
  totals: { intern: number; employer: number };
}) {
  const router = useRouter();
  const [audience, setAudience] = useState<"intern" | "employer">("intern");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [everyone, setEveryone] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const roster = audience === "intern" ? interns : employers;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (p) => p.label.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [roster, query]);

  function toggle(id: string) {
    setSent(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (picked.size === 0 && !everyone) {
      setError("Pick at least one recipient.");
      return;
    }
    if (!title.trim() || !message.trim()) {
      setError("A title and a message are both required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientType: audience,
          recipientIds: everyone ? [] : Array.from(picked),
          all: everyone,
          title: title.trim(),
          message: message.trim(),
          type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send the notification.");
      const noun = audience === "intern" ? "candidate" : "company";
      const n = Number(data.count ?? picked.size);
      setSent(`Sent to ${n} ${noun}${n === 1 ? "" : "s"}.`);
      setEveryone(false);
      setPicked(new Set());
      setTitle("");
      setMessage("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the notification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <div className="flex gap-0.5 rounded-[10px] bg-ink-100 p-1">
          {(["intern", "employer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setAudience(value);
                setPicked(new Set());
              }}
              aria-pressed={audience === value}
              className={
                audience === value
                  ? "apple-spring apple-pressable inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[8px] bg-white px-3 text-[14px] font-medium text-ink-900 shadow-xs"
                  : "apple-spring apple-pressable inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-3 text-[14px] font-medium text-ink-500 hover:text-ink-800"
              }
            >
              {value === "intern" ? "Candidates" : "Companies"}
            </button>
          ))}
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this list"
            aria-label="Search recipients"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:border-brand-600 max-lg:min-h-11"
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-ink-500">
            {picked.size} of {roster.length} selected
          </span>
          <label className="flex items-center gap-1.5 font-medium text-ink-800">
            <input type="checkbox" className="size-4 accent-brand-700" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
            Everyone ({totals[audience]})
          </label>
          <button
            type="button"
            disabled={everyone}
            onClick={() =>
              setPicked(picked.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id)))
            }
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {picked.size === filtered.length && filtered.length > 0 ? "Clear" : "Select all shown"}
          </button>
        </div>

        <ul className="mt-2 max-h-80 space-y-0.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="py-4 text-sm text-ink-500">Nobody matches that.</li>
          ) : (
            filtered.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="mt-0.5 size-4 rounded border-ink-300 accent-brand-700"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink-800">{p.label}</span>
                    <span className="block truncate text-2xs text-ink-500">{p.email}</span>
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
          <div>
            <label htmlFor="notif-title" className="block text-sm font-medium text-ink-800">
              Title
            </label>
            <input
              id="notif-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Timesheets are open for this month"
              className="mt-1.5 min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:border-brand-600"
            />
          </div>
          <div>
            <label htmlFor="notif-type" className="block text-sm font-medium text-ink-800">
              Type
            </label>
            <select
              id="notif-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none focus-visible:border-brand-600"
            >
              <option value="custom">Custom</option>
              <option value="announcement">Announcement</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        <label htmlFor="notif-message" className="mt-4 block text-sm font-medium text-ink-800">
          Message
        </label>
        <textarea
          id="notif-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="What changed, and what they should do about it."
          className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:border-brand-600"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Send to {picked.size}
          </button>
          <p className="text-2xs text-ink-500">
            Notifications appear in the recipient&apos;s bell. Nothing is emailed.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p role="status" className="mt-3 text-sm text-brand-700">
            {sent}
          </p>
        ) : null}
      </div>
    </div>
  );
}