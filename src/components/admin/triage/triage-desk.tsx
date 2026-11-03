"use client";

/**
 * The Triage desk: the owed bar and its filters, the queue as a keyboard-driven
 * list of records, and the peek for the selected one. It is the only client
 * component of the dashboard's interactive part; the page, the money strip and
 * the timeline stay on the server.
 *
 * Keys (not while typing in a field or inside a dialog): J / ArrowDown and
 * K / ArrowUp move the selection and the focus, Enter opens the record's own
 * page, E moves focus to the peek's action (opens the sheet below 1024px),
 * Escape in the peek returns focus to the list. Roving tabindex: the selected
 * row is the list's one tab stop.
 *
 * Working the queue: clearing a payout collapses its row (180ms exit, the
 * rows below slide up with FLIP), the group and total counts tick down, and
 * the bar segment shrinks, so the page visibly empties. The numbers come from
 * the server props minus what was cleared locally and not yet gone from the
 * refreshed props, so a refresh never double-counts.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";

import { Count, FlipGroup, FlipItem, useExitFocus } from "@/components/admin/motion";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { QueueGroup, QueueKey, QueueRecord } from "@/lib/admin/dashboard-queues.types";
import { cn } from "@/lib/utils";
import { AdminAvatar } from "@/components/admin/avatar";
import { Panel } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { FILTER_LABEL, figureTone, plural, rowFigures } from "./format";
import { OwedBar } from "./owed-bar";
import { TickCount } from "./tick-count";
import { TriagePeek } from "./triage-peek";
import { WORK_QUEUE_EVENT } from "./work-queue-button";

type Filter = "all" | QueueKey;
type Item = { record: QueueRecord; group: QueueGroup };

const DESKTOP = "(min-width: 1024px)";
const subscribeDesktop = (cb: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** null while the server renders: the desktop peek is in the HTML and CSS hides it on a phone. */
function useIsDesktop(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => null,
  );
}

const FIELD_OR_DIALOG = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="combobox"]';

export function TriageDesk({
  groups,
  total,
  nowMs,
  footer,
  initialFilter,
}: {
  groups: QueueGroup[];
  /** Server total of what needs you (queues plus active flags). */
  total: number;
  /** The server's clock for this render, so "in 2 h" reads the same on both sides. */
  nowMs: number;
  /** The quiet last line of the list (incomplete profiles). */
  footer?: ReactNode;
  /** Opens on one queue (the dashboard's "Needs you" rows link here); falls back to all when it is empty. */
  initialFilter?: QueueKey;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { moveFocus, exit } = useExitFocus();

  const [filter, setFilter] = useState<Filter>(initialFilter ?? "all");
  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [note, setNote] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  // What the server says, minus what was cleared here and has not left the props yet.
  const live = useMemo(
    () =>
      groups.map((g) => {
        const records = g.records.filter((r) => !resolved.has(r.id));
        return { ...g, records, count: Math.max(0, g.count - (g.records.length - records.length)) };
      }),
    [groups, resolved],
  );
  const clearedHere = groups.reduce((sum, g, i) => sum + (g.records.length - live[i].records.length), 0);

  const shown = live.filter((g) => g.error || g.count > 0 || g.records.length > 0);
  const liveTotal = Math.max(0, total - clearedHere);
  const activeFilter: Filter = filter !== "all" && !shown.some((g) => g.key === filter) ? "all" : filter;
  const listed = activeFilter === "all" ? shown : shown.filter((g) => g.key === activeFilter);

  const items: Item[] = useMemo(() => listed.flatMap((g) => g.records.map((record) => ({ record, group: g }))), [listed]);
  const ids = items.map((i) => i.record.id);

  const [sel, setSel] = useState<{ id: string | null; index: number }>(() => ({ id: ids[0] ?? null, index: 0 }));
  // A selection that left the list (cleared, filtered out, refreshed away) moves to its neighbour.
  if (sel.id === null ? ids.length > 0 : !ids.includes(sel.id)) {
    const index = Math.max(0, Math.min(sel.index, ids.length - 1));
    setSel({ id: ids[index] ?? null, index });
  }
  const selectedItem = items.find((i) => i.record.id === sel.id) ?? null;
  const selectedIndex = selectedItem ? ids.indexOf(selectedItem.record.id) : -1;

  const focusRow = useCallback((id: string | null | undefined) => {
    if (!id) return false;
    const el = rowRefs.current.get(id);
    el?.focus();
    return !!el && document.activeElement === el;
  }, []);

  const select = useCallback(
    (id: string) => setSel({ id, index: Math.max(0, ids.indexOf(id)) }),
    [ids],
  );

  const move = useCallback(
    (delta: number) => {
      if (!ids.length) return;
      const at = selectedIndex < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, selectedIndex + delta));
      select(ids[at]);
      focusRow(ids[at]);
    },
    [ids, selectedIndex, select, focusRow],
  );

  /** A record is done: focus moves to its neighbour first, then the row leaves. */
  const resolve = useCallback(
    (id: string) => {
      const at = ids.indexOf(id);
      const neighbour = ids[at + 1] ?? ids[at - 1] ?? null;
      const row = rowRefs.current.get(id) ?? null;
      const inPeek = !!peekRef.current?.contains(document.activeElement) || (!!row && row.contains(document.activeElement));
      if (inPeek || document.activeElement === document.body) {
        if (!focusRow(neighbour)) moveFocus(row?.parentElement ?? null, listRef);
      }
      if (neighbour) setSel({ id: neighbour, index: Math.max(0, ids.indexOf(neighbour)) });
      setResolved((prev) => new Set(prev).add(id));
      setSheetOpen(false);
      const title = items[at]?.record.title;
      setNote(`${title ?? "Record"} cleared. ${Math.max(0, liveTotal - 1)} left.`);
    },
    [ids, items, liveTotal, focusRow, moveFocus],
  );

  // The keyboard, on the window so J and K work from anywhere on the page. The latest closure is
  // kept in a ref that is refreshed after every render.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const blocked = !!target?.closest(FIELD_OR_DIALOG);
      const inList = !!target && !!listRef.current?.contains(target);
      const inPeek = !!target && !!peekRef.current?.contains(target);
      const key = e.key;
      if (key === "Escape") {
        if (inPeek && !blocked) {
          e.preventDefault();
          focusRow(sel.id);
        }
        return;
      }
      if (blocked) return;
      if (key === "j" || key === "J" || (key === "ArrowDown" && inList)) {
        e.preventDefault();
        move(1);
      } else if (key === "k" || key === "K" || (key === "ArrowUp" && inList)) {
        e.preventDefault();
        move(-1);
      } else if (key === "e" || key === "E") {
        if (!selectedItem) return;
        e.preventDefault();
        if (isDesktop === false) setSheetOpen(true);
        else peekRef.current?.querySelector<HTMLElement>("[data-peek-actions] :is(a[href], button:not([disabled]))")?.focus();
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "Work the queue": the first row, selected and focused.
  const work = useRef<() => void>(() => {});
  useEffect(() => {
    work.current = () => {
      if (!ids.length) return;
      select(ids[0]);
      focusRow(ids[0]);
    };
  });
  useEffect(() => {
    const onWork = () => work.current();
    window.addEventListener(WORK_QUEUE_EVENT, onWork);
    return () => window.removeEventListener(WORK_QUEUE_EVENT, onWork);
  }, []);

  const segments = shown.map((g) => ({ key: g.key, count: g.count, flag: !!g.flag }));
  const filters: { key: Filter; label: string; count: number | null }[] = [
    { key: "all", label: "All", count: liveTotal },
    ...shown.map((g) => ({ key: g.key as Filter, label: FILTER_LABEL[g.key], count: g.flag ? null : g.error ? null : g.count })),
  ];

  const peek = selectedItem ? (
    <TriagePeek
      key={selectedItem.record.id}
      record={selectedItem.record}
      group={selectedItem.group}
      hasNext={selectedIndex < ids.length - 1}
      onNext={() => move(1)}
      onSaved={resolve}
    />
  ) : null;

  return (
    <FlipGroup>
      <section aria-label="Needs you" className="space-y-[var(--admin-gap)]">
        <Panel className="p-[var(--admin-pad-panel)]">
          <p className="flex items-baseline gap-1.5 text-base text-text-subtle">
            <span data-testid="queue-total" className="nums text-2xl font-semibold text-foreground">
              <TickCount value={liveTotal} />
            </span>
            {plural(liveTotal, "thing needs you", "things need you")}
          </p>
          <div className="mt-3">
            <OwedBar segments={segments} />
          </div>

          {shown.length ? (
            <div role="group" aria-label="Filter the queue" className="-mx-1 mt-4 flex flex-wrap gap-2">
              {filters.map((f) => {
                const on = f.key === activeFilter;
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm outline-none touch:h-11",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      on
                        ? "border-[color:var(--admin-rule)] bg-[color:var(--admin-panel-2)] font-semibold text-foreground"
                        : "border-transparent text-text-subtle hover:bg-[color:var(--admin-panel-2)] hover:text-foreground",
                    )}
                  >
                    {f.label}
                    {f.count != null ? <span className="nums ml-1.5">{f.count}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </Panel>

        <div className="grid gap-[var(--admin-gap)] lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
          {/* The queue */}
          <Panel className="min-w-0 p-[var(--admin-pad-panel)]">
            {shown.length === 0 ? (
              <p className="py-6 text-sm text-foreground">Nothing is waiting on the team.</p>
            ) : (
              <div ref={listRef} data-testid="triage-list">
                <AnimatePresence initial={false}>
                  {listed.flatMap((g) => {
                    const head = (
                      <FlipItem
                        key={`head-${g.key}`}
                        layoutId={`head-${g.key}`}
                        exit={exit}
                        className="flex items-baseline gap-2 px-2 pb-1 pt-5 first:pt-0"
                      >
                        <h3 className="text-sm font-semibold text-foreground">{g.label}</h3>
                        {g.flag ? null : g.error ? null : (
                          <span data-testid={`queue-count-${g.key}`} className="nums text-sm text-text-subtle">
                            <Count value={g.count} />
                          </span>
                        )}
                        {!g.flag && !g.error && g.fresh > 0 ? <span className="nums text-[13px] text-text-subtle">+{g.fresh} new</span> : null}
                      </FlipItem>
                    );

                    if (g.error) {
                      return [
                        head,
                        <FlipItem key={`err-${g.key}`} layoutId={`err-${g.key}`} exit={exit} className="flex flex-wrap items-center gap-x-3 px-2 py-2 text-sm text-foreground">
                          <span role="alert">Could not load this queue.</span>
                          <button
                            type="button"
                            onClick={() => router.refresh()}
                            className="inline-flex min-h-9 items-center text-foreground underline underline-offset-4 outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
                          >
                            Try again<span className="sr-only">: {g.label}</span>
                          </button>
                        </FlipItem>,
                      ];
                    }

                    const rows = g.records.map((r) => {
                      const on = r.id === sel.id;
                      const fig = rowFigures(r, nowMs);
                      return (
                        <FlipItem key={r.id} layoutId={`row-${r.id}`} exit={exit}>
                          <button
                            type="button"
                            ref={(el) => {
                              if (el) rowRefs.current.set(r.id, el);
                              else rowRefs.current.delete(r.id);
                            }}
                            data-testid="triage-row"
                            data-record={r.id}
                            aria-current={on ? "true" : undefined}
                            tabIndex={on ? 0 : -1}
                            onClick={() => {
                              select(r.id);
                              if (isDesktop === false) setSheetOpen(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
                                e.preventDefault();
                                router.push(r.href);
                              }
                            }}
                            className={cn(
                              "group grid min-h-[var(--admin-row-h)] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left outline-none",
                              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                              on ? "bg-[color:var(--admin-panel-2)]" : "hover:bg-[color:var(--admin-panel-2)]",
                            )}
                          >
                            <AdminAvatar name={r.title} id={r.id} size="md" />
                            <span className="min-w-0">
                              <span title={r.title} className="block truncate text-sm font-semibold leading-5 text-foreground">
                                {r.title}
                              </span>
                              <span title={r.subtitle} className="block truncate text-xs leading-4 text-text-subtle">
                                {r.subtitle}
                              </span>
                            </span>
                            <span className="nums flex min-w-16 flex-col items-end gap-1 text-right">
                              <span className="text-sm font-semibold leading-5 text-foreground">
                                {fig.main ?? <span className="text-text-subtle">-</span>}
                              </span>
                              {fig.sub ? <StatusBadge tone={figureTone(fig.sub)} label={fig.sub} dot={false} /> : null}
                            </span>
                          </button>
                        </FlipItem>
                      );
                    });

                    const out = [head, ...rows];
                    if (g.flag && g.records.length === 0) {
                      out.push(
                        <FlipItem key={`flag-${g.key}`} layoutId={`flag-${g.key}`} exit={exit} className="flex flex-wrap items-center justify-between gap-x-4 px-2 py-2">
                          <span className="min-w-0 max-w-prose text-pretty text-[13px] leading-5 text-foreground">{g.detail}</span>
                          <Link
                            href={g.moreHref}
                            className="inline-flex min-h-9 shrink-0 items-center text-sm text-foreground underline underline-offset-4 outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
                          >
                            {g.moreLabel}
                          </Link>
                        </FlipItem>,
                      );
                    } else if (!g.flag && g.count > g.records.length) {
                      out.push(
                        <FlipItem key={`more-${g.key}`} layoutId={`more-${g.key}`} exit={exit} className="px-2">
                          <Link
                            href={g.moreHref}
                            className="inline-flex min-h-9 items-center text-sm text-text-subtle underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
                          >
                            See all <span className="nums ml-1">{g.count}</span>
                            <span className="sr-only"> ({g.moreLabel})</span>
                          </Link>
                        </FlipItem>,
                      );
                    }
                    return out;
                  })}
                </AnimatePresence>
              </div>
            )}

            <p className="mt-6 hidden px-2 text-xs text-text-subtle lg:block">J K to move · Enter to open · E to act</p>
            {footer ? <div className="mt-4 border-t border-[color:var(--admin-rule)] px-2 pt-4">{footer}</div> : null}
          </Panel>

          {/* The peek (1024px and up; a sheet below) */}
          <aside
            ref={peekRef}
            aria-label="Selected record"
            className="hidden min-w-0 rounded-[var(--radius-admin-card)] border border-[color:var(--admin-panel-edge)] bg-[color:var(--admin-panel)] p-[var(--admin-pad-panel)] lg:sticky lg:top-6 lg:block lg:self-start"
          >
            {isDesktop === false ? null : peek ?? (
              <p className="text-sm text-foreground">Nothing is selected. Pick a record to see it here.</p>
            )}
          </aside>
        </div>
      </section>

      {isDesktop === false ? (
        <Sheet open={sheetOpen && !!selectedItem} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              focusRow(sel.id);
            }}
            className="max-h-[88dvh] gap-0 overflow-y-auto px-4 pb-8 pt-4"
          >
            <SheetTitle className="sr-only">{selectedItem?.record.title ?? "Record"}</SheetTitle>
            <SheetDescription className="sr-only">{selectedItem?.group.label}</SheetDescription>
            <div className="pr-10">{peek}</div>
          </SheetContent>
        </Sheet>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>
    </FlipGroup>
  );
}
