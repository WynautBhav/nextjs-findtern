"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Eye, EyeOff, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/**
 * Bulk selection, as context around server-rendered table children.
 *
 * The obvious implementation — a `"use client"` table that receives a
 * `columns` array of render functions — does not work in the App Router. A
 * server component cannot pass a function to a client component, and React
 * throws: *"Functions cannot be passed directly to Client Components"*.
 *
 * Wrapping server-rendered `children` in a client context provider solves both
 * problems at once. The selection state is client-side and interactive, while
 * every cell stays a server component — so the table still streams from the
 * database and ships zero client JavaScript for its contents.
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setSelected((current) =>
      current.size === ids.length ? new Set() : new Set(ids),
    );
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  async function run(action: BulkActionSpec) {
    const ids = [...selected];
    if (ids.length === 0) return;

    if (action.confirm) {
      const message = action.confirm.replace("{n}", String(ids.length));
      if (!confirm(message)) return;
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

  const value = useMemo(
    () => ({ selected, toggle, toggleAll, clear, isSelected }),
    [selected, toggle, toggleAll, clear, isSelected],
  );

  return (
    <BulkSelectContext.Provider value={value}>
      {children}

      {error ? (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-start gap-2 rounded-lg border border-danger/25 bg-white px-3.5 py-2.5 text-sm text-danger shadow-lg"
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

      {selected.size > 0 && actions.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div
            role="region"
            aria-label={`Actions for ${selected.size} selected ${noun}`}
            className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-ink-200 bg-white py-2 pr-2 pl-4 shadow-lg"
          >
            <p className="text-sm font-medium whitespace-nowrap text-ink-800">
              <span className="tabular-nums">{selected.size}</span> selected
            </p>

            <span aria-hidden className="h-5 w-px bg-ink-200" />

            {actions.map((action) => {
              const Icon = action.icon ? ICONS[action.icon] : null;
              return (
                <button
                  key={action.label}
                  type="button"
                  disabled={running !== null}
                  onClick={() => run(action)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    action.tone === "danger"
                      ? "text-danger hover:bg-danger-soft"
                      : "text-ink-700 hover:bg-ink-100",
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
              className="cursor-pointer rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
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
 * Header checkbox. `ids` is the current page's ids — selection is explicitly
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
      aria-label={`Select all ${ids.length} ${noun} on this page`}
    />
  );
}

/** Per-row checkbox. The only client component in the table body. */
export function RowCheckbox({ id }: { id: string }) {
  const { isSelected, toggle } = useBulkSelect();
  const checked = isSelected(id);

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={() => toggle(id)}
      aria-label="Select row"
      className={cn(
        "transition-opacity",
        checked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100",
      )}
    />
  );
}
