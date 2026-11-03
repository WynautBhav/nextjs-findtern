"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Panel } from "@/components/admin/panel";
import { ActivityTimeline } from "@/components/admin/record-activity-timeline";
import type { ActivityEntry } from "@/lib/admin/record-activity.types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The admin record page frame (candidate and company).
 *
 * Two columns from 1024px: a 320px card for the person or company on the
 * left (a plain column: Info and Activities scroll with the page)
 * and the record on the right. Below that the card stacks under the title and
 * above the tabs. DOM order is title, card, body, which is also the reading
 * order on a phone. The shell already draws the breadcrumb, so the title row
 * carries only a back arrow.
 */
export function RecordLayout({
  left,
  children,
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
}: {
  /** The `RecordCard` for the person or company. */
  left: React.ReactNode;
  /** The right column below the title: tabs, figures, tab body. */
  children: React.ReactNode;
  /** The page's one h1. */
  title: string;
  /** The "Created on ..." line. */
  subtitle?: React.ReactNode;
  backHref: string;
  /** Accessible name of the back arrow, e.g. "All candidates". */
  backLabel: string;
  /** Pill buttons on the subtitle row. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-x-[var(--admin-gap)] gap-y-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      <header className="min-w-0 lg:col-start-2 lg:row-start-1">
        <div className="flex items-start gap-3">
          <Link
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="apple-spring mt-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-[color:var(--admin-panel)] text-foreground hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] sm:text-[2rem]">
              {title}
            </h1>
            {subtitle || actions ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                {subtitle ? <p className="text-sm text-text-subtle">{subtitle}</p> : <span />}
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <aside
        aria-label="Summary"
        // Not sticky: this card holds the review, visibility and account controls, so it can be taller
        // than the screen, and a sticky or inner-scrolling card hides its lower controls.
        className={cn("min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start")}
      >
        {left}
      </aside>

      <div className="min-w-0 space-y-[var(--admin-gap)] lg:col-start-2 lg:row-start-2">{children}</div>
    </div>
  );
}

/** A 44px square tile: Mail, Call, View as. Children is the icon. */
export const QUICK_ACTION_CLASS =
  "apple-spring grid size-11 shrink-0 place-items-center rounded-2xl bg-[color:var(--admin-panel-2)] text-foreground hover:bg-[color:var(--admin-tile)] hover:text-[color:var(--admin-tile-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

export function QuickAction({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a href={href} aria-label={label} title={label} className={QUICK_ACTION_CLASS}>
      {children}
    </a>
  );
}

/** One labelled property in the Info list. The label sits above the value, so a 320px card never squeezes either. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-xs font-medium text-text-subtle">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function InfoList({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-[color:var(--admin-rule)]">{children}</dl>;
}

const VIEWS = [
  { key: "info", label: "Info" },
  { key: "activities", label: "Activities" },
] as const;
type View = (typeof VIEWS)[number]["key"];

/**
 * The person or company card: avatar, name, id line, quick-action tiles, the
 * last-activity line, then an Info / Activities switch. Both views stay
 * mounted (the inactive one is `hidden`) so an inline control keeps its state
 * when staff flip to Activities and back.
 */
export function RecordCard({
  avatar,
  name,
  idLine,
  quickActions,
  lastActivityAt,
  info,
  activities,
}: {
  avatar: React.ReactNode;
  name: string;
  /** e.g. "Candidate · a1b2c3d4". */
  idLine: string;
  /** `QuickAction` tiles (and the View as tile). */
  quickActions?: React.ReactNode;
  /** ISO time of the newest activity, or null when there is none to show. */
  lastActivityAt?: string | null;
  /** The key properties, usually an `InfoList`. */
  info: React.ReactNode;
  /** null when the activity could not be loaded. */
  activities: ActivityEntry[] | null;
}) {
  const [view, setView] = useState<View>("info");
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % VIEWS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + VIEWS.length) % VIEWS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = VIEWS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setView(VIEWS[next].key);
    refs.current[next]?.focus();
  }

  return (
    <Panel>
      <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
        <div className="[&>*]:size-24 [&>*]:text-3xl">{avatar}</div>
        <h2 className="mt-4 max-w-full text-xl font-semibold leading-snug tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]">{name}</h2>
        <p className="mt-0.5 max-w-full text-sm text-text-subtle [overflow-wrap:anywhere]">{idLine}</p>
        {quickActions ? <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{quickActions}</div> : null}
        <p className="mt-4 text-sm text-text-subtle">
          Last activity{" "}
          <span className="font-medium text-foreground">{lastActivityAt ? formatDate(lastActivityAt) : "none recorded"}</span>
        </p>
      </div>

      <div className="px-5">
        <div
          role="tablist"
          aria-label="Record summary"
          className="grid grid-cols-2 gap-1 rounded-full bg-[color:var(--admin-panel-2)] p-1"
        >
          {VIEWS.map((v, index) => {
            const selected = view === v.key;
            return (
              <button
                key={v.key}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${v.key}`}
                aria-selected={selected}
                aria-controls={`${uid}-panel-${v.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setView(v.key)}
                onKeyDown={(e) => onKeyDown(e, index)}
                className={cn(
                  "min-h-9 rounded-full px-3 text-sm transition-colors touch:min-h-11",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected
                    ? "bg-[color:var(--admin-panel)] font-semibold text-foreground"
                    : "font-medium text-text-subtle hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${uid}-panel-info`}
        aria-labelledby={`${uid}-tab-info`}
        hidden={view !== "info"}
        className="p-5"
      >
        {info}
      </div>
      <div
        role="tabpanel"
        id={`${uid}-panel-activities`}
        aria-labelledby={`${uid}-tab-activities`}
        hidden={view !== "activities"}
        className="p-5"
      >
        <ActivityTimeline entries={activities} />
      </div>
    </Panel>
  );
}
