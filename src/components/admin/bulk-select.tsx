"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Check, Eye, EyeOff, X } from "lucide-react";

import { useConfirm } from "@/components/app/use-confirm";
import { Checkbox } from "@/components/ui/checkbox";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { selectionScope } from "./table-state.ts";

/**
 * Bulk selection, as context around server-rendered table children.
 *
 * The obvious implementation - a `"use client"` table that receives a
 * `columns` array of render functions - does not work in the App Router. A
 * server component cannot pass a function to a client component, and React
 * throws: *"Functions cannot be passed directly to Client Components"*.
 *
 * Wrapping server-rendered `children` in a client context provider solves both
 * problems at once. The selection state is client-side and interactive, while
 * every cell stays a server component - so the table still streams from the
 * database and ships zero client JavaScript for its contents.
 *
 * The selection is scoped to the query string: changing the page, sort, search
 * or any filter clears it, so an action can never reach rows the admin can no
 * longer see. "Select all" is explicitly the visible page.
 *
 * Actions are described by a serializable spec (endpoint + payload) rather than
 * a callback, for the same reason: the page cannot hand the client a function.
 */

export type BulkActionSpec = {
  label: string;
  endpoint: string;
  payload?: Record<string, unknown>;
  /** Confirmation copy. `{n}` is replaced with the selection count. */
  confirm?: string;
  tone?: "default" | "danger";
  icon?: "eye" | "eye-off" | "check" | "ban";
};

const ICONS = {
  eye: Eye,
  "eye-off": EyeOff,
  check: Check,
  ban: Ban,
} as const;

type BulkSelectValue = {
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
};

const BulkSelectContext = createContext<BulkSelectValue | null>(null);

export function useBulkSelect(): BulkSelectValue {
  const context = useContext(BulkSelectContext);
  if (!context) {
    throw new Error("useBulkSelect must be used inside <BulkSelectProvider>");
  }
  return context;
}

export function BulkSelectProvider({
  children,
  actions = [],
  noun = "records",
}: {
  children: React.ReactNode;
  actions?: BulkActionSpec[];
  noun?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { ask, dialog } = useConfirm();

  const searchParams = useSearchParams();
  const scope = selectionScope(searchParams);

  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedScope, setSelectedScope] = useState(scope);
  // Derived-state reset during render (no effect, no stale frame): a new query
  // string means a different set of rows.
  if (scope !== selectedScope) {
    setSelectedScope(scope);
    setSelected(new Set());
    setError(null);
  }

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Compares against the visible ids, not set sizes: a selection of the same
  // size from elsewhere must not read as "all selected".
  const toggleAll = useCallback((ids: string[]) => {
    setSelected((current) => {
      const all = ids.length > 0 && ids.every((id) => current.has(id));
      const next = new Set(current);
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  async function run(action: BulkActionSpec) {
    const ids = [...selected];
    if (ids.length === 0) return;

    if (action.confirm) {
      const message = action.confirm.replace("{n}", String(ids.length));
      const ok = await ask({
        title: `${action.label} ${ids.length} selected?`,
        body: message,
        confirmLabel: action.label,
        destructive: action.tone === "danger",
      });
      if (!ok) return;
    }

    setRunning(action.label);
    setError(null);
    try {
      const response = await csrfFetch(action.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(action.payload ?? {}), ids }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }

      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (cause) {
      // Selection is deliberately kept on failure, so retrying does not mean
      // re-ticking every box.
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setRunning(null);
    }
  }

  const barVisible = selected.size > 0 && actions.length > 0;
  const barHadFocus = useRef(false);
  // When the bar unmounts while it held focus, focus would fall to <body>:
  // put it back on the header checkbox instead.
  useEffect(() => {
    if (barVisible || !barHadFocus.current) return;
    barHadFocus.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    document.querySelector<HTMLElement>("[data-bulk-anchor]")?.focus();
  }, [barVisible]);

  const value = useMemo(
    () => ({ selected, toggle, toggleAll, clear, isSelected }),
    [selected, toggle, toggleAll, clear, isSelected],
  );

  return (
    <BulkSelectContext.Provider value={value}>
      {children}
      {/* Keeps the last rows and the pager clear of the fixed bar. */}
      {barVisible ? <div aria-hidden className="h-24 touch:h-28" /> : null}
      {dialog}

      {error ? (
        <div
          role="alert"
          className="apple-admin fixed inset-x-0 bottom-20 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-start gap-2 rounded-apple-sm border border-danger/25 bg-card px-3.5 py-2.5 text-sm text-danger shadow-lg"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="rounded p-0.5 transition-colors hover:bg-danger-soft"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {barVisible ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div
            onFocus={() => {
              barHadFocus.current = true;
            }}
            onBlur={(e) => {
              // A removed button reports a null relatedTarget; only a real move elsewhere counts.
              if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) barHadFocus.current = false;
            }}
            role="region"
            aria-label={`Actions for ${selected.size} selected ${noun}`}
            className="apple-admin pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-apple-lg border border-border bg-card py-2 pr-2 pl-4 shadow-lg"
          >
            <p className="text-sm font-medium whitespace-nowrap text-foreground">
              <span className="tabular-nums">{selected.size}</span> selected
            </p>

            <span aria-hidden className="h-5 w-px bg-border" />

            {actions.map((action) => {
              const Icon = action.icon ? ICONS[action.icon] : null;
              return (
                <button
                  key={action.label}
                  type="button"
                  disabled={running !== null}
                  onClick={() => run(action)}
                  className={cn(
                    "apple-spring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-apple-sm px-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 touch:min-h-11 touch:min-w-11 touch:px-3",
                    action.tone === "danger"
                      ? "text-danger hover:bg-danger-soft"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {Icon ? <Icon className="size-4" aria-hidden /> : null}
                  {running === action.label ? "Working…" : action.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={clear}
              aria-label="Clear selection"
              className="apple-spring inline-flex cursor-pointer items-center justify-center rounded-apple-sm p-1.5 text-text-subtle hover:bg-muted hover:text-foreground touch:min-h-11 touch:min-w-11"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </BulkSelectContext.Provider>
  );
}

/**
 * Header checkbox. `ids` is the current page's ids - selection is explicitly
 * per-page, because a select-all that silently reaches 439 rows from a 25-row
 * view is how a whole base gets hidden by accident.
 */
export function SelectAllCheckbox({
  ids,
  noun = "records",
}: {
  ids: string[];
  noun?: string;
}) {
  const { selected, toggleAll } = useBulkSelect();
  const onPage = ids.filter((id) => selected.has(id)).length;
  const allSelected = ids.length > 0 && onPage === ids.length;

  return (
    <Checkbox
      checked={allSelected ? true : onPage > 0 ? "indeterminate" : false}
      onCheckedChange={() => toggleAll(ids)}
      data-bulk-anchor=""
      aria-label={`Select all ${ids.length} ${noun} on this page`}
    />
  );
}

/** Per-row checkbox. The only client component in the table body. */
export function RowCheckbox({ id, label }: { id: string; /** The row's name, so the box reads "Select Asha Rao" rather than "Select row". */ label?: string }) {
  const { isSelected, toggle } = useBulkSelect();
  const checked = isSelected(id);

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={() => toggle(id)}
      aria-label={label ? `Select ${label}` : "Select row"}
      className={cn(
        "transition-opacity",
        // Shown on hover with a mouse; always on touch, which has no hover (QA-146).
        checked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 touch:opacity-100",
      )}
    />
  );
}
