"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, ChevronDown, Search, X } from "lucide-react";

import { LIGHT_TILE, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { useConfirm } from "@/components/app/use-confirm";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { csrfFetch } from "@/lib/client-fetch";
import type { MyCollege } from "@/lib/college/membership";
import { cn } from "@/lib/utils";
import { PushToggle } from "./college-push";
import { SelectField } from "./onboarding/fields";

type Option = { id: string; name: string; city: string | null; state: string | null; isPartner: boolean; code: string | null };

const YEARS = [
  { value: 1, label: "1st year" },
  { value: 2, label: "2nd year" },
  { value: 3, label: "3rd year" },
  { value: 4, label: "4th year" },
  { value: 5, label: "5th year" },
];

const FIELD =
  "min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-base text-ink-900 placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600/30";

export function CollegeForm({
  initial,
  institution,
  vapidKey,
}: {
  initial: MyCollege | null;
  institution: string;
  vapidKey: string;
}) {
  const [editing, setEditing] = useState(!initial);

  if (initial && !editing) {
    return <Membership college={initial} vapidKey={vapidKey} onChange={() => setEditing(true)} />;
  }
  return (
    <JoinForm
      initial={initial}
      institution={institution}
      onCancel={initial ? () => setEditing(false) : undefined}
      onSaved={() => setEditing(false)}
    />
  );
}

/* ── Already a member ───────────────────────────────────────────────── */

function Membership({
  college,
  vapidKey,
  onChange,
}: {
  college: MyCollege;
  vapidKey: string;
  onChange: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();
  const verified = college.status === "verified";

  async function leave() {
    const ok = await ask({
      title: `Leave ${college.name}?`,
      body: "You leave this college. Your placement team stops seeing you and you disappear from its drives straight away. Your Findtern profile stays as it is.",
      confirmLabel: "Yes, leave this college",
    });
    if (!ok) return;
    setLeaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/intern/college", { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't leave right now. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't leave. Check your connection and try again.");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className={cn("grid gap-8", college.isPartner && "xl:grid-cols-[minmax(0,1fr)_22rem]")}>
      <div className="min-w-0 space-y-8">
        <Surface className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-apple-md bg-brand-50 text-brand-700">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">{college.name}</h2>
              <p className="mt-0.5 text-sm text-ink-600">
                {[college.year ? YEARS.find((y) => y.value === college.year)?.label : null, college.branch, college.city]
                  .filter(Boolean)
                  .join(" · ") || "Year and branch not set"}
              </p>
              <div className="mt-3">
                {verified ? (
                  <Pill tone="live">
                    <BadgeCheck className="size-3.5" aria-hidden />
                    Verified student
                  </Pill>
                ) : (
                  <Pill tone="waiting">Not verified yet</Pill>
                )}
              </div>
            </div>
          </div>

          <p className="mt-5 border-t border-ink-100 pt-4 text-sm leading-relaxed text-ink-700">
            {verified
              ? college.verifiedBy === "roster"
                ? "Your email is on your college's student list, so employers in its drives see you as a verified student."
                : "You signed up with your college email, so employers in its drives see you as a verified student."
              : "Employers in your college's drives only see verified students. You'll be verified automatically when your placement office adds your email to their student list, or if you sign up with your college email. Your placement officer can also add you to a drive by hand."}
          </p>

          {!college.isPartner ? (
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Your college doesn&apos;t run drives on Findtern yet. Your choice is saved, so you&apos;re included the day it does.
            </p>
          ) : null}
        </Surface>

        <section>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onChange} className={cn(buttonVariants({ variant: "outline", size: "md" }))}>
              Change college
            </button>
            <button
              type="button"
              onClick={leave}
              disabled={leaving}
              className={cn(buttonVariants({ variant: "ghost", size: "md" }), "text-danger hover:bg-danger-soft")}
            >
              {leaving ? "Leaving…" : "Leave college"}
            </button>
            {dialog}
          </div>
          {/* Mounted empty, then filled, so the message is announced. */}
          <div role="alert" className="mt-2 text-sm text-danger">
            {error}
          </div>
        </section>
      </div>

      {/* Drives and call alerts exist only for partner colleges. */}
      {college.isPartner ? (
      <aside className="space-y-4">
        <Surface className="p-5">
          <h2 className="text-base font-semibold text-ink-900">Call alerts</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            During a drive, employers can ask you to a short video call at a few minutes&apos; notice. Alerts make sure you
            don&apos;t miss one.
          </p>
          <PushToggle vapidKey={vapidKey} className="mt-3" />
        </Surface>
      </aside>
      ) : null}
    </div>
  );
}

/* ── Picking a college ──────────────────────────────────────────────── */

function JoinForm({
  initial,
  institution,
  onCancel,
  onSaved,
  embedded = false,
  defaultBranch = "",
  onPicked,
}: {
  initial: MyCollege | null;
  institution: string;
  onCancel?: () => void;
  onSaved: () => void;
  /** Inside the profile's Academics step: no card of its own, and the picked name is handed back. */
  embedded?: boolean;
  defaultBranch?: string;
  onPicked?: (name: string) => void;
}) {
  const router = useRouter();
  const ids = useId();
  const [chosen, setChosen] = useState<Option | null>(
    initial ? { id: initial.collegeId, name: initial.name, city: initial.city, state: null, isPartner: initial.isPartner, code: null } : null,
  );
  const [year, setYear] = useState<number | "">(initial?.year ?? "");
  const [branch, setBranch] = useState(initial?.branch ?? defaultBranch);
  const [adult, setAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which control the message is about: it is marked invalid, tied to the message, and focused.
  const [invalid, setInvalid] = useState<"college" | "adult" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const errorId = `${ids}-error`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) {
      setError("Choose your college from the list.");
      setInvalid("college");
      searchRef.current?.focus();
      return;
    }
    if (!adult) {
      setError("Confirm that you are 18 or older.");
      setInvalid("adult");
      document.getElementById(`${ids}-adult`)?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    setInvalid(null);
    try {
      const res = await csrfFetch("/api/intern/college", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId: chosen.id,
          year: year === "" ? null : year,
          branch: branch.trim() || null,
          declaredAdult: adult,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't save. Try again.");
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "space-y-8",
        embedded ? "" : cn("max-w-3xl rounded-apple-xl border border-ink-200/80 bg-white p-5 sm:p-8", LIGHT_TILE),
      )}
      noValidate
    >
      <section>
        <SectionHead title="College" hint="Type your college's name, or the code your placement office gave you." />
        {chosen ? (
          <div className="flex items-center gap-3 rounded-apple-xl border border-ink-200/80 p-4">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-apple-sm bg-brand-50 text-brand-700">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium leading-snug text-ink-900">{chosen.name}</p>
              <p className="text-sm text-ink-600">
                {[chosen.city, chosen.state, chosen.code].filter(Boolean).join(", ")}
                {chosen.isPartner ? (chosen.city ? " · " : "") + "Runs drives on Findtern" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-apple-sm px-3 text-sm font-medium text-primary hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              Change
            </button>
          </div>
        ) : (
          <CollegeSearch
            initialQuery={!embedded && institution.trim().length >= 3 ? institution.trim() : ""}
            inputRef={searchRef}
            invalid={invalid === "college"}
            describedBy={errorId}
            onPick={(o) => {
              setChosen(o);
              setError(null);
              setInvalid(null);
              onPicked?.(o.name);
            }}
          />
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${ids}-year`}
          label="Year of study"
          value={year === "" ? "" : String(year)}
          onChange={(v) => setYear(v ? Number(v) : "")}
          options={YEARS.map((y) => ({ value: String(y.value), label: y.label }))}
          placeholder="Choose"
        />
        <div>
          <label htmlFor={`${ids}-branch`} className="mb-1.5 block text-sm font-medium text-ink-800">
            Branch <span className="font-normal text-text-subtle">(optional)</span>
          </label>
          <input
            id={`${ids}-branch`}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            maxLength={120}
            placeholder="e.g. CSE, ECE, BBA"
            autoComplete="off"
            className={FIELD}
          />
        </div>
        <p className="text-sm leading-relaxed text-ink-600 sm:col-span-2">
          If your college has you on its student list, the year and branch on that list are used instead.
        </p>
      </section>

      <label htmlFor={`${ids}-adult`} className="flex cursor-pointer items-start gap-3">
        <Checkbox
          id={`${ids}-adult`}
          checked={adult}
          onCheckedChange={(v) => {
            setAdult(v === true);
            setError(null);
            setInvalid(null);
          }}
          aria-invalid={invalid === "adult" ? true : undefined}
          aria-describedby={invalid === "adult" ? errorId : undefined}
          className="mt-0.5 size-5"
        />
        <span className="text-sm leading-relaxed text-ink-800">
          I am 18 or older.{" "}
          <span className="text-ink-600">If you&apos;re under 18, ask your placement office to add you with a parent&apos;s consent.</span>
        </span>
      </label>

      {/* Mounted empty, then filled, so the message is announced. */}
      <div id={errorId} role="alert" className="text-sm font-medium text-danger">
        {error}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className={cn(buttonVariants({ variant: embedded ? "outline" : "primary", size: "md" }))}>
          {saving ? "Saving…" : initial ? "Save changes" : "Join college"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={cn(buttonVariants({ variant: "light", size: "md" }))}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/* ── Search combobox ─────────────────────────────────────────────────── */

function CollegeSearch({
  initialQuery,
  onPick,
  inputRef,
  invalid = false,
  describedBy,
}: {
  initialQuery: string;
  onPick: (o: Option) => void;
  /** Lets the form focus the field when a submit fails. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  invalid?: boolean;
  describedBy?: string;
}) {
  const ids = useId();
  const [query, setQuery] = useState(initialQuery);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(Boolean(initialQuery));
  const reqId = useRef(0);
  const ownInput = useRef<HTMLInputElement>(null);
  const searchInput = inputRef ?? ownInput;

  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error("search failed");
        const body = (await res.json().catch(() => ({}))) as { colleges?: Option[] };
        if (id === reqId.current) {
          setOptions(body.colleges ?? []);
          setActive(0);
          setFailed(false);
        }
      } catch {
        if (id === reqId.current) {
          setOptions([]);
          setFailed(true);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const listId = `${ids}-list`;
  const optionId = (i: number) => `${ids}-opt-${i}`;

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && options[active]) {
        e.preventDefault();
        onPick(options[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && options.length > 0;

  return (
    <div>
      <label htmlFor={`${ids}-q`} className="sr-only">
        College name or code
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
        <input
          ref={searchInput}
          id={`${ids}-q`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? describedBy : undefined}
          aria-activedescendant={showList && options[active] ? optionId(active) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="College name or code"
          autoComplete="off"
          className={cn(FIELD, "pl-10 pr-10")}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              searchInput.current?.focus();
            }}
            className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-apple-sm text-text-subtle hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-brand-700"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Colleges"
        hidden={!showList}
        className="mt-2 max-h-80 overflow-y-auto rounded-apple-lg border border-ink-200/80 bg-white p-1 shadow-sm"
      >
        {options.map((o, i) => (
          <li
            key={o.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(o)}
            onMouseEnter={() => setActive(i)}
            className={cn(
              "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-apple-sm px-3 py-2",
              i === active ? "bg-brand-50" : "",
            )}
          >
            <span className="min-w-0">
              <span className="block break-words text-base leading-snug text-ink-900">{o.name}</span>
              <span className="block break-words text-sm text-ink-600">{[o.city, o.state, o.code].filter(Boolean).join(" · ")}</span>
            </span>
            {o.isPartner ? (
              <Pill tone="live" className="shrink-0">
                Partner
              </Pill>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-sm text-ink-600" role="status" aria-live="polite">
        {loading
          ? "Searching…"
          : failed
            ? "Couldn't search colleges. Check your connection and keep typing to try again."
            : query.trim().length >= 2 && options.length === 0
              ? "No college matches. Check the spelling, or tell us about it below."
              : query.trim().length < 2
                ? "Colleges that run drives on Findtern are shown first."
                : `${options.length} match${options.length === 1 ? "" : "es"}`}
      </p>

      <MissingCollege query={query.trim()} />
    </div>
  );
}

/* ── "My college isn't listed" ───────────────────────────────────────── */

// Sits inside the join <form>, so it is not a <form> itself: Enter sends the request instead of submitting the join.
function MissingCollege({ query }: { query: string }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  // The toggle and the form replace each other, so whichever unmounts hands focus to the other.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) nameInput.current?.focus();
    else if (wasOpen.current) toggle.current?.focus();
    wasOpen.current = open;
  }, [open]);

  async function send() {
    if (sending) return;
    if (name.trim().length < 3 || city.trim().length < 2 || state.trim().length < 2) {
      setError("Add your college's name, city and state.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/intern/college/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city, state }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't send. Try again.");
        return;
      }
      setMessage(`Thanks. We've sent ${name.trim()} to the Findtern team. Once it's added, come back here and pick it.`);
      setOpen(false);
      setName("");
      setCity("");
      setState("");
    } catch {
      setError("Couldn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void send();
  };

  return (
    <div className="mt-3">
      {!open ? (
        <button
          ref={toggle}
          type="button"
          onClick={() => {
            setName((n) => n || query);
            setMessage("");
            setOpen(true);
          }}
          className="inline-flex min-h-11 items-center rounded-apple-sm text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-brand-700"
        >
          {message ? "Add another college" : "My college isn’t listed"}
        </button>
      ) : null}

      {open ? (
        <div role="group" aria-labelledby={`${ids}-h`} className="space-y-3 rounded-apple-xl border border-ink-200/80 p-4">
          <div>
            <p id={`${ids}-h`} className="text-sm font-semibold text-ink-900">
              Tell us your college
            </p>
            <p className="mt-0.5 text-sm text-ink-600">We&apos;ll add it. You can then pick it here.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={`${ids}-name`} className="mb-1.5 block text-sm font-medium text-ink-800">
                College name
              </label>
              <input ref={nameInput} id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} maxLength={200} autoComplete="off" className={FIELD} />
            </div>
            <div>
              <label htmlFor={`${ids}-city`} className="mb-1.5 block text-sm font-medium text-ink-800">
                City
              </label>
              <input id={`${ids}-city`} value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={onEnter} maxLength={100} autoComplete="off" className={FIELD} />
            </div>
            <div>
              <label htmlFor={`${ids}-state`} className="mb-1.5 block text-sm font-medium text-ink-800">
                State
              </label>
              <input id={`${ids}-state`} value={state} onChange={(e) => setState(e.target.value)} onKeyDown={onEnter} maxLength={60} autoComplete="off" className={FIELD} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={send} disabled={sending} className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
              {sending ? "Sending…" : "Send to Findtern"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "light", size: "md" }))}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Mounted empty, then filled, so both messages are announced. */}
      <div role="alert" className="mt-2 text-sm font-medium text-danger">
        {error}
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-sm font-medium text-ink-800">
        {message}
      </p>
    </div>
  );
}

/* ── In the profile's Academics step ─────────────────────────────────── */

/**
 * Optional "join your college" block under the institution field. Joining is
 * what lets the college's placement team and its virtual drives find the
 * student, so it is the same join as in Settings.
 * Changing or leaving it later happens there.
 */
export function CollegeLink({
  college,
  institution,
  branch,
  onPicked,
}: {
  college: MyCollege | null;
  institution: string;
  branch: string;
  onPicked: (name: string) => void;
}) {
  if (college) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-apple-xl border border-ink-200/80 bg-white p-5 text-sm">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-apple-sm bg-brand-50 text-brand-700">
          <Building2 className="size-4" />
        </span>
        <p className="min-w-0 flex-1 text-ink-700">
          You&apos;ve joined <span className="font-medium text-ink-900">{college.name}</span>
          {college.status === "verified" ? " · verified student" : ""}
        </p>
        <Link
          href="/intern/settings#college"
          className="inline-flex min-h-11 items-center rounded-apple-sm px-2 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-brand-700"
        >
          Manage in Settings
        </Link>
      </div>
    );
  }
  return (
    <details className="group rounded-apple-xl border border-ink-200/80 bg-white p-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline-2 focus-visible:outline-brand-700">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900">Join your college&apos;s placement drives (optional)</span>
          <span className="block text-sm text-ink-600">
            Colleges run virtual drives on Findtern. Find yours by name or college code to be included.
          </span>
        </span>
        <ChevronDown className="size-5 shrink-0 text-text-subtle transition-transform duration-[var(--duration-admin-base)] ease-[var(--ease-out-soft)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="details-reveal mt-4">
        <JoinForm
          embedded
          initial={null}
          institution={institution}
          defaultBranch={branch}
          onPicked={onPicked}
          onSaved={() => {}}
        />
      </div>
    </details>
  );
}
