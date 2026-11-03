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

import { AdminTabs } from "@/components/admin/admin-tabs";
import { Panel } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonClass } from "@/components/ui/button";
import { NOTIFICATION_LINK_RULE, isSafeNotificationLink } from "@/lib/admin/notification-types";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Person = { id: string; label: string; email: string };
type Side = "intern" | "employer";

const field =
  "mt-1.5 min-h-11 w-full rounded-full border border-ink-300 bg-[color:var(--admin-panel)] px-4 text-base sm:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle";
/** Multi-line fields keep a soft card corner; a pill clips the text. */
const area = "rounded-2xl py-2.5";

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
  const { ask, dialog } = useConfirm();
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
  /** The field the current error is about (its id), so it can be marked invalid and focused. */
  const [errorField, setErrorField] = useState<string | null>(null);
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

  function fail(message: string, field: string | null = null) {
    setError(message);
    setErrorField(field);
    if (field) {
      const el = document.getElementById(field);
      // The JSON box sits in a closed <details>; focus does nothing on a hidden element.
      el?.closest("details")?.setAttribute("open", "");
      el?.focus();
    }
  }

  /** aria-invalid and the link to the error text, for the field the error is about. */
  const bad = (id: string) => (errorField === id ? ({ "aria-invalid": true, "aria-describedby": "notif-error" } as const) : {});

  async function send() {
    setSent(null);
    setErrorField(null);
    const empty = sides.find((s) => countFor(s) === 0);
    if (empty) {
      fail(
        audience === "both"
          ? `Pick at least one ${empty === "intern" ? "candidate" : "company"}, or tick Everyone on that side.`
          : "Pick at least one recipient, or tick Everyone.",
      );
      return;
    }
    if (!title.trim() || !message.trim()) {
      fail("A title and a message are both required.", title.trim() ? "notif-message" : "notif-title");
      return;
    }
    let data: Record<string, unknown> = {};
    if (dataJson.trim()) {
      try {
        const parsed: unknown = JSON.parse(dataJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        data = parsed as Record<string, unknown>;
      } catch {
        fail('Extra data must be a JSON object, for example {"proposalId": "…"}.', "notif-data");
        return;
      }
    }
    if (link.trim()) {
      if (!isSafeNotificationLink(link.trim())) {
        fail(NOTIFICATION_LINK_RULE, "notif-link");
        return;
      }
      data = { ...data, link: link.trim() };
    }

    const who = sides
      .map((s) => `${countFor(s).toLocaleString("en-IN")} ${s === "intern" ? (countFor(s) === 1 ? "candidate" : "candidates") : countFor(s) === 1 ? "company" : "companies"}`)
      .join(" and ");
    const ok = await ask({
      title: `Send this to ${who}?`,
      body: `"${title.trim()}" appears in each recipient's bell straight away and cannot be recalled.`,
      confirmLabel: `Yes, send to ${total.toLocaleString("en-IN")}`,
    });
    if (!ok) return;

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
      "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium max-lg:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      active ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "text-text-subtle hover:text-foreground",
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      {dialog}
      <Panel aria-labelledby="recipients-title" className="min-w-0 p-[var(--admin-pad-panel)]">
        <h2 id="recipients-title" className="text-lg font-semibold text-foreground">
          Recipients
        </h2>
        <div role="group" aria-label="Audience" className="mt-3 flex gap-0.5 rounded-full bg-[color:var(--admin-panel-2)] p-1">
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
          <AdminTabs
            label="Pick from"
            className="mt-3"
            active={viewing}
            onSelect={(key) => setViewing(key as Side)}
            items={(["intern", "employer"] as const).map((s) => ({
              key: s,
              label: s === "intern" ? "Candidates" : "Companies",
              count: everyone[s] ? "all" : picked[s].size,
            }))}
          />
        ) : null}

        <label className="mt-4 flex min-h-11 items-center gap-2.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-[color:var(--admin-tile)]"
            checked={everyone[side]}
            onChange={(e) => setEveryone((prev) => ({ ...prev, [side]: e.target.checked }))}
          />
          Every active {side === "intern" ? "candidate" : "company"}
          <span className="nums ml-auto text-text-subtle">{totals[side].toLocaleString("en-IN")}</span>
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
              className={cn(field, "mt-0 pl-10")}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="nums text-text-subtle">
              {picked[side].size} picked
            </span>
            <button type="button" onClick={toggleShown} disabled={filtered.length === 0} className={buttonClass({ variant: "ghost", size: "sm", className: "rounded-full px-4 hover:bg-[color:var(--admin-panel-2)]" })}>
              {allShownPicked ? "Clear shown" : "Pick all shown"}
            </button>
          </div>
          {roster.length >= 50 ? (
            <p className="mt-1 text-xs text-text-subtle">Showing the 50 newest. Search and press Enter to find anyone else.</p>
          ) : null}
          <ul className="mt-2 max-h-80 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="py-4 text-sm text-text-subtle">Nobody matches that search.</li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-2xl px-2.5 py-1.5 hover:bg-[color:var(--admin-panel-2)]">
                    <input type="checkbox" checked={picked[side].has(p.id)} onChange={() => toggle(p.id)} className="size-4 shrink-0 accent-[color:var(--admin-tile)]" />
                    <span className="min-w-0">
                      <span className="block break-words text-sm text-foreground">{p.label || p.email}</span>
                      <span className="block break-all text-xs text-text-subtle">{p.email}</span>
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </fieldset>
      </Panel>

      <Panel aria-labelledby="message-title" className="min-w-0 p-[var(--admin-pad-panel)]">
        <h2 id="message-title" className="text-lg font-semibold text-foreground">
          Message
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
          <div>
            <label htmlFor="notif-title" className="block text-sm font-medium text-foreground">
              Title
            </label>
            <input id="notif-title" {...bad("notif-title")} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Timesheets are open for this month" className={field} />
          </div>
          <div>
            <label htmlFor="notif-type" className="block text-sm font-medium text-foreground">
              Type
            </label>
            {/* A choice, not free text: the stored values are the legacy ones. */}
            <select id="notif-type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
              {[
                ["announcement", "Announcement"],
                ["update", "Product update"],
                ["promo", "Offer or promotion"],
                ["alert", "Alert"],
                ["maintenance", "Maintenance"],
                ["custom", "Other"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor="notif-message" className="mt-4 block text-sm font-medium text-foreground">
          Message
        </label>
        <textarea
          id="notif-message"
          {...bad("notif-message")}
          value={message}
          maxLength={4000}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="What changed, and what they should do about it."
          className={cn(field, area)}
        />

        <label htmlFor="notif-link" className="mt-4 block text-sm font-medium text-foreground">
          Link <span className="font-normal text-text-subtle">(optional)</span>
        </label>
        <input id="notif-link" {...bad("notif-link")} value={link} onChange={(e) => setLink(e.target.value)} placeholder="/intern/proposals" className={field} />
        <p className="mt-1 text-xs text-text-subtle">Where tapping the notification takes them: a page on this site.</p>

        <details className="mt-4 rounded-2xl bg-[color:var(--admin-panel-2)] px-4 py-2.5">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Advanced: data for developers</summary>
          <textarea
            id="notif-data"
            {...bad("notif-data")}
            aria-label="Extra data as JSON"
            value={dataJson}
            onChange={(e) => setDataJson(e.target.value)}
            rows={3}
            placeholder='{"proposalId": "…"}'
            className={cn(field, area)}
          />
          <p className="mt-1 text-xs text-text-subtle">Stored on the notification as legacy did. Leave empty if unsure.</p>
        </details>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={send} disabled={busy} className={buttonClass({ variant: "primary", className: ADMIN_PILL_PRIMARY })}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            Send to <span className="nums">{total.toLocaleString("en-IN")}</span>
          </button>
          <p className="text-sm text-text-subtle">Shows in each recipient&apos;s bell. Nothing is emailed.</p>
        </div>

        {error ? (
          <p id="notif-error" role="alert" className="mt-3 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p role="status" className="mt-3 text-sm font-medium text-success">
            {sent}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
