"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Roving-focus keyboard layer for `DataTable` (`keyboardNav`).
 *
 * `DataTable` is a server component and its rows are server-rendered (often by
 * a caller's `renderRow`), so this wrapper cannot own the rows. It wraps them
 * and keeps the table a plain table (no `role="grid"` swap): each row's
 * primary link (the first `<a href>`; the `<tr>` itself when it has none) is
 * the row's focus target, and only the active row's target is in the tab order
 * (`tabIndex` 0, the rest -1). So Tab enters the list once and leaves it once.
 *
 * With focus on a row's target: j / ArrowDown and k / ArrowUp move to the next
 * or previous row, Enter opens (`onRowOpen`, else `rowHref`; a real link just
 * follows its own href), `x` toggles the row's selection checkbox, and Space
 * peeks only when an `onRowPeek` handler exists (otherwise Space is left
 * alone). Ignored while typing in a field or with a modifier held; keys
 * pressed on a button or checkbox inside a row keep their own meaning.
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

const ROW = "tbody > tr";
const PRIMARY_LINK = "a[href]";

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const latest = useRef({ rows, hrefs, onRowOpen, onRowPeek, router });

  // Keep the key handler reading current props without re-binding it.
  useEffect(() => {
    latest.current = { rows, hrefs, onRowOpen, onRowPeek, router };
  });

  // Re-apply the roving tabindex after every render: paging and sorting
  // re-render the rows, sometimes reusing DOM nodes.
  useEffect(() => {
    const trs = rowEls(wrapRef.current);
    if (activeRef.current >= trs.length) activeRef.current = Math.max(0, trs.length - 1);
    trs.forEach((tr, i) => {
      focusTarget(tr).tabIndex = i === activeRef.current ? 0 : -1;
    });
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const moveTo = (trs: HTMLElement[], next: number) => {
      const i = Math.max(0, Math.min(trs.length - 1, next));
      trs.forEach((tr, n) => {
        focusTarget(tr).tabIndex = n === i ? 0 : -1;
      });
      activeRef.current = i;
      focusTarget(trs[i]).focus();
      trs[i].scrollIntoView({ block: "nearest" });
    };

    const rowOf = (el: EventTarget | null) =>
      el instanceof HTMLElement ? (el.closest(ROW) as HTMLElement | null) : null;

    const onFocusIn = (e: FocusEvent) => {
      const tr = rowOf(e.target);
      const trs = rowEls(wrap);
      trs.forEach((row) => row.toggleAttribute("data-active", row === tr));
      const i = tr ? trs.indexOf(tr) : -1;
      if (i >= 0) {
        activeRef.current = i;
        trs.forEach((row, n) => {
          focusTarget(row).tabIndex = n === i ? 0 : -1;
        });
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const tr = rowOf(e.target);
      if (tr && !(e.relatedTarget instanceof Node && tr.contains(e.relatedTarget))) tr.removeAttribute("data-active");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented || !NO_MOD(e)) return;
      const tr = rowOf(e.target);
      // Only keys pressed on the row's own focus target; a button or checkbox inside a row keeps its own keys.
      if (!tr || e.target !== focusTarget(tr)) return;
      const trs = rowEls(wrap);
      const cur = trs.indexOf(tr);
      if (cur < 0) return;
      const { rows: data, hrefs: links, onRowOpen: open, onRowPeek: peek, router: r } = latest.current;
      const row = data?.[cur];

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveTo(trs, cur + 1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveTo(trs, cur - 1);
          break;
        case "Enter":
          if (open && row !== undefined) {
            e.preventDefault();
            open(row);
          } else if (e.target instanceof HTMLTableRowElement && links?.[cur]) {
            // No link in the row: the row itself is the target. A real link follows its own href.
            e.preventDefault();
            r.push(links[cur]);
          }
          break;
        case " ":
          // Without a peek handler Space keeps its default (scrolls the page, or presses a button).
          if (peek && row !== undefined) {
            e.preventDefault();
            peek(row);
          }
          break;
        case "x": {
          // Only where the row already has a selection checkbox (BulkSelect).
          const box = tr.querySelector<HTMLElement>('[role="checkbox"], input[type="checkbox"]');
          if (box) {
            e.preventDefault();
            box.click();
          }
          break;
        }
      }
    };

    wrap.addEventListener("keydown", onKeyDown);
    wrap.addEventListener("focusin", onFocusIn);
    wrap.addEventListener("focusout", onFocusOut);
    return () => {
      wrap.removeEventListener("keydown", onKeyDown);
      wrap.removeEventListener("focusin", onFocusIn);
      wrap.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      data-stack
      className={cn(
        "[&_tbody_tr:focus-visible]:outline-2 [&_tbody_tr:focus-visible]:-outline-offset-2 [&_tbody_tr:focus-visible]:outline-ring",
        "[&_tbody_tr[data-active]]:bg-muted [&_tbody_tr[data-active]_[role=checkbox]]:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

function rowEls(wrap: HTMLElement | null) {
  return wrap ? Array.from(wrap.querySelectorAll<HTMLElement>(ROW)) : [];
}

/** A row's primary link, else the row itself. */
function focusTarget(tr: HTMLElement): HTMLElement {
  return tr.querySelector<HTMLElement>(PRIMARY_LINK) ?? tr;
}
