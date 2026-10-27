"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, CircleHelp, Search, X } from "lucide-react";

import { Pill, SectionHead, Surface } from "@/components/app/primitives";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { csrfFetch } from "@/lib/client-fetch";
import type { MyCollege } from "@/lib/college/membership";
import { cn } from "@/lib/utils";
import { PushToggle } from "./college-push";

type Purpose = { id: string; label: string; detail: string };
type Option = { id: string; name: string; city: string | null; state: string | null; isPartner: boolean };

const YEARS = [
  { value: 1, label: "1st year" },
  { value: 2, label: "2nd year" },
  { value: 3, label: "3rd year" },
  { value: 4, label: "4th year" },
  { value: 5, label: "5th year" },
];

const FIELD =
  "min-h-11 w-full rounded-[10px] border border-ink-200 bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600/30";

export function CollegeForm({
  initial,
  institution,
  purposes,
  notice,
  vapidKey,
}: {
  initial: MyCollege | null;
  institution: string;
  purposes: Purpose[];
  notice: { version: string; text: string };
  vapidKey: string;
}) {
  const [editing, setEditing] = useState(!initial);

  if (initial && !editing) {
    return <Membership college={initial} purposes={purposes} vapidKey={vapidKey} onChange={() => setEditing(true)} />;
  }
  return (
    <JoinForm
      initial={initial}
      institution={institution}
      purposes={purposes}
      notice={notice}
      onCancel={initial ? () => setEditing(false) : undefined}
      onSaved={() => setEditing(false)}
    />
  );
}

/* ── Already a member ───────────────────────────────────────────────── */

function Membership({
  college,
  purposes,
  vapidKey,
  onChange,
}: {
  college: MyCollege;
  purposes: Purpose[];
  vapidKey: string;
  onChange: () => void;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verified = college.status === "verified";
  const granted = purposes.filter((p) => college.purposes.includes(p.id as MyCollege["purposes"][number]));

  async function leave() {
    setLeaving(true);
    setError(null);
    const res = await csrfFetch("/api/intern/college", { method: "DELETE" });
    setLeaving(false);
    if (!res.ok) {
      setError("Couldn't leave right now. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-8">
        <Surface className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-brand-50 text-brand-700">
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
          <SectionHead title="What you've agreed to" hint="You can change this at any time." />
          <Surface as="ul" className="divide-y divide-ink-100">
            {purposes.map((p) => {
              const on = granted.some((g) => g.id === p.id);
              return (
                <li key={p.id} className="flex items-start gap-3 px-5 py-4">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                      on ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-500",
                    )}
                  >
                    {on ? "✓" : "–"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {p.label}
                      <span className="sr-only">{on ? ": agreed" : ": not agreed"}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-600">{p.detail}</p>
                  </div>
                </li>
              );
            })}
          </Surface>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={onChange} className={cn(buttonVariants({ variant: "outline", size: "md" }))}>
              Change college or choices
            </button>
            <Dialog>
              <DialogTrigger asChild>
                <button type="button" className={cn(buttonVariants({ variant: "ghost", size: "md" }), "text-danger hover:bg-danger-soft")}>
                  Leave college
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Leave {college.name}?</DialogTitle>
                  <DialogDescription>
                    This withdraws your consent. Your placement team stops seeing your progress and you disappear from your
                    college&apos;s drives straight away. Your Findtern profile stays as it is.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <button type="button" className={cn(buttonVariants({ variant: "light", size: "md" }))}>
                      Stay
                    </button>
                  </DialogClose>
                  <button type="button" onClick={leave} disabled={leaving} className={cn(buttonVariants({ variant: "primary", size: "md" }), "bg-danger hover:bg-danger/90")}>
                    {leaving ? "Leaving…" : "Leave and withdraw consent"}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </section>
      </div>

      <aside className="space-y-4">
        <Surface className="p-5">
          <p className="text-[13px] font-medium text-ink-600">Call alerts</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">
            During a drive, employers can ask you to a short video call at a few minutes&apos; notice. Alerts make sure you
            don&apos;t miss one.
          </p>
          <PushToggle vapidKey={vapidKey} className="mt-3" />
        </Surface>
      </aside>
    </div>
  );
}

/* ── Picking a college ──────────────────────────────────────────────── */

function JoinForm({
  initial,
  institution,
  purposes,
  notice,
  onCancel,
  onSaved,
}: {
  initial: MyCollege | null;
  institution: string;
  purposes: Purpose[];
  notice: { version: string; text: string };
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const [chosen, setChosen] = useState<Option | null>(
    initial ? { id: initial.collegeId, name: initial.name, city: initial.city, state: null, isPartner: initial.isPartner } : null,
  );
  const [year, setYear] = useState<number | "">(initial?.year ?? "");
  const [branch, setBranch] = useState(initial?.branch ?? "");
  // Never pre-ticked, even when changing an existing choice: consent is re-given, not carried over silently.
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [adult, setAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenPurposes = purposes.filter((p) => agreed[p.id]).map((p) => p.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) {
      setError("Choose your college from the list.");
      return;
    }
    if (!adult) {
      setError("Confirm that you are 18 or older.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await csrfFetch("/api/intern/college", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collegeId: chosen.id,
        year: year === "" ? null : year,
        branch: branch.trim() || null,
        purposes: chosenPurposes,
        declaredAdult: adult,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Couldn't save. Try again.");
      return;
    }
    onSaved();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-8" noValidate>
      <section>
        <SectionHead title="College" hint="Search by name, city or AISHE code." />
        {chosen ? (
          <Surface className="flex items-center gap-3 p-4">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-700">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium leading-snug text-ink-900">{chosen.name}</p>
              <p className="text-[13px] text-ink-600">
                {[chosen.city, chosen.state].filter(Boolean).join(", ")}
                {chosen.isPartner ? (chosen.city ? " · " : "") + "Runs drives on Findtern" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-medium text-primary hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              Change
            </button>
          </Surface>
        ) : (
          <CollegeSearch initialQuery={institution} onPick={setChosen} />
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-year`} className="mb-1.5 block text-sm font-medium text-ink-800">
            Year of study
          </label>
          <select
            id={`${ids}-year`}
            value={year}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
            className={FIELD}
          >
            <option value="">Choose</option>
            {YEARS.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-branch`} className="mb-1.5 block text-sm font-medium text-ink-800">
            Branch <span className="font-normal text-ink-500">(optional)</span>
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
        <p className="text-[13px] leading-relaxed text-ink-600 sm:col-span-2">
          If your college has you on its student list, the year and branch on that list are used instead.
        </p>
      </section>

      <fieldset>
        <legend className="text-base font-semibold tracking-[-0.01em] text-ink-900">What your college can do</legend>
        <p className="mt-0.5 text-sm text-ink-600">
          Tick what you&apos;re happy with. Each is separate, and you can withdraw either one later.
        </p>
        <div className="mt-3 space-y-3">
          {purposes.map((p) => (
            <label
              key={p.id}
              htmlFor={`${ids}-${p.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[14px] border bg-white p-4 transition-colors",
                agreed[p.id] ? "border-brand-300 bg-brand-50/40" : "border-ink-200/80 hover:border-ink-300",
              )}
            >
              <Checkbox
                id={`${ids}-${p.id}`}
                checked={Boolean(agreed[p.id])}
                onCheckedChange={(v) => setAgreed((a) => ({ ...a, [p.id]: v === true }))}
                className="mt-0.5 size-5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-900">{p.label}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-600">{p.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {chosenPurposes.length === 0 ? (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-ink-600">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            With neither ticked, your college is saved on your profile but its placement team can&apos;t see you and you won&apos;t
            appear in its drives.
          </p>
        ) : null}
        <details className="group mt-4 rounded-[10px] text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-brand-700">
            Read the full notice (version {notice.version})
          </summary>
          <div className="mt-2 whitespace-pre-line rounded-[10px] border border-ink-200/80 bg-ink-50 p-4 text-[13px] leading-relaxed text-ink-700">
            {notice.text}
          </div>
        </details>
      </fieldset>

      <label htmlFor={`${ids}-adult`} className="flex cursor-pointer items-start gap-3">
        <Checkbox
          id={`${ids}-adult`}
          checked={adult}
          onCheckedChange={(v) => {
            setAdult(v === true);
            setError(null);
          }}
          className="mt-0.5 size-5"
        />
        <span className="text-sm leading-relaxed text-ink-800">
          I am 18 or older.{" "}
          <span className="text-ink-600">If you&apos;re under 18, ask your placement office to add you with a parent&apos;s consent.</span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
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

function CollegeSearch({ initialQuery, onPick }: { initialQuery: string; onPick: (o: Option) => void }) {
  const ids = useId();
  const [query, setQuery] = useState(initialQuery);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(Boolean(initialQuery));
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/colleges/search?q=${encodeURIComponent(query.trim())}`);
        const body = (await res.json().catch(() => ({}))) as { colleges?: Option[] };
        if (id === reqId.current) {
          setOptions(body.colleges ?? []);
          setActive(0);
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
        Search for your college
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          id={`${ids}-q`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? optionId(active) : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Start typing your college's name"
          autoComplete="off"
          className={cn(FIELD, "pl-10 pr-10")}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-[8px] text-ink-400 hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-brand-700"
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
        className="mt-2 max-h-80 overflow-y-auto rounded-[14px] border border-ink-200/80 bg-white p-1 shadow-[0_6px_24px_rgb(7_47_36/0.08)]"
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
              "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2",
              i === active ? "bg-brand-50" : "",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] text-ink-900">{o.name}</span>
              <span className="block truncate text-[13px] text-ink-600">{[o.city, o.state].filter(Boolean).join(", ")}</span>
            </span>
            {o.isPartner ? (
              <Pill tone="live" className="shrink-0">
                Partner
              </Pill>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[13px] text-ink-600" role="status" aria-live="polite">
        {loading
          ? "Searching…"
          : query.trim().length >= 2 && options.length === 0
            ? "No college by that name yet. Check the spelling, or ask your placement office to contact Findtern."
            : query.trim().length < 2
              ? "Colleges that run drives on Findtern are shown first."
              : `${options.length} match${options.length === 1 ? "" : "es"}`}
      </p>
    </div>
  );
}
