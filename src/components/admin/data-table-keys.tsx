"use client";

import { useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Roving-focus keyboard layer for `DataTable` (`keyboardNav`).
 *
 * `DataTable` is a server component and its rows are server-rendered (often by
 * a caller's `renderRow`), so this wrapper cannot own the rows. It wraps them
 * instead and drives the `<table>` the way a listbox works: the table takes
 * focus and `aria-activedescendant` points at the active row, whose id is set
 * here. The active row is marked `data-active`, which the class below turns
 * into the `bg-ink-100` highlight.
 *
 * `onRowOpen` / `onRowPeek` are functions, so they only work when `DataTable`
 * is rendered from a client component. From a server page use `rowHref`, which
 * `DataTable` resolves into plain strings before it reaches this file.
 */

const NO_MOD = (e: KeyboardEvent) => !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey);

function isTyping(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return Boolean(el.closest("input, select, textarea, [contenteditable]:not([contenteditable=false])"));
}

export function DataTableKeys<T>({
  rows,
  hrefs,
  onRowOpen,
  onRowPeek,
  className,
  children,
}: {
  /** Only needed (and only serialisable) when `onRowOpen` / `onRowPeek` is set. */
  rows?: T[];
  /** One href per row, resolved from `rowHref` on the server. */
  hrefs?: string[];
  onRowOpen?: (row: T) => void;
  onRowPeek?: (row: T) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const baseId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(-1);
  const latest = useRef({ rows, hrefs, onRowOpen, onRowPeek, router });

  // Keep the key handler reading current props without re-binding it.
  useEffect(() => {
    latest.current = { rows, hrefs, onRowOpen, onRowPeek, router };
  });

  // Row ids and the active mark follow whatever the server last rendered
  // (paging and sorting re-render the rows, sometimes reusing DOM nodes).
  // `aria-activedescendant` is only honoured on widget roles, not on a plain table: this table is
  // driven like a grid while keyboard navigation is on (it keeps its caption as its name).
  useEffect(() => {
    const table = wrapRef.current?.querySelector("table");
    if (!table) return;
    table.setAttribute("role", "grid");
    return () => table.removeAttribute("role");
  }, []);

  useEffect(() => {
    const table = wrapRef.current?.querySelector("table");
    if (!table) return;
    const trs = Array.from(table.querySelectorAll<HTMLElement>("tbody > tr"));
    trs.forEach((tr, i) => {
      tr.id = `${baseId}-row-${i}`;
      tr.toggleAttribute("data-active", i === activeRef.current && document.activeElement === table);
    });
    if (activeRef.current >= trs.length) activeRef.current = -1;
    const active = trs[activeRef.current];
    if (active && document.activeElement === table) table.setAttribute("aria-activedescendant", active.id);
    else table.removeAttribute("aria-activedescendant");
  });

  useEffect(() => {
    const table = wrapRef.current?.querySelector("table");
    if (!table) return;
    table.tabIndex = 0;

    const rowEls = () => Array.from(table.querySelectorAll<HTMLElement>("tbody > tr"));

    const setActive = (next: number) => {
      const trs = rowEls();
      if (!trs.length) return;
      const i = Math.max(0, Math.min(trs.length - 1, next));
      activeRef.current = i;
      trs.forEach((tr, n) => tr.toggleAttribute("data-active", n === i));
      table.setAttribute("aria-activedescendant", trs[i].id);
      trs[i].scrollIntoView({ block: "nearest" });
    };

    const onFocus = () => {
      const trs = rowEls();
      if (!trs.length) return;
      setActive(activeRef.current < 0 ? 0 : activeRef.current);
    };
    const onBlur = () => {
      rowEls().forEach((tr) => tr.removeAttribute("data-active"));
      table.removeAttribute("aria-activedescendant");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Only keys pressed on the table itself; a link or button inside a row keeps its own keys.
      if (e.target !== table || isTyping(e.target) || e.defaultPrevented || !NO_MOD(e)) return;
      const trs = rowEls();
      if (!trs.length) return;
      const cur = activeRef.current;
      const { rows: data, hrefs: links, onRowOpen: open, onRowPeek: peek, router: r } = latest.current;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setActive(cur + 1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setActive(cur < 0 ? 0 : cur - 1);
          break;
        case "Enter": {
          if (cur < 0) return;
          const row = data?.[cur];
          if (open && row !== undefined) {
            e.preventDefault();
            open(row);
          } else if (links?.[cur]) {
            e.preventDefault();
            r.push(links[cur]);
          }
          break;
        }
        case " ": {
          if (cur < 0) return;
          const row = data?.[cur];
          if (peek && row !== undefined) {
            e.preventDefault();
            peek(row);
          } else if (peek) {
            e.preventDefault();
          }
          break;
        }
        case "x": {
          if (cur < 0) return;
          // Only where the row already has a selection checkbox (BulkSelect).
          const box = trs[cur]?.querySelector<HTMLElement>('[role="checkbox"], input[type="checkbox"]');
          if (box) {
            e.preventDefault();
            box.click();
          }
          break;
        }
      }
    };

    table.addEventListener("keydown", onKeyDown);
    table.addEventListener("focus", onFocus);
    table.addEventListener("blur", onBlur);
    return () => {
      table.removeEventListener("keydown", onKeyDown);
      table.removeEventListener("focus", onFocus);
      table.removeEventListener("blur", onBlur);
      table.removeAttribute("tabindex");
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      data-stack
      className={cn(
        "[&_table:focus-visible]:outline-2 [&_table:focus-visible]:-outline-offset-2 [&_table:focus-visible]:outline-brand-600",
        "[&_tbody_tr[data-active]]:bg-ink-100 [&_tbody_tr[data-active]_[role=checkbox]]:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
