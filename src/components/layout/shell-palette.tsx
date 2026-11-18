"use client";

/**
 * Ctrl K for intern, employer and college: jump to any page of the console, or open the assistant.
 * Same look as the admin palette (`admin/command-palette.tsx`): a search field in the top bar that
 * opens a ruled list, the selected row stamped in deep green, key hints in the footer.
 * The combobox (role, listbox, active descendant) lives on the input inside the dialog.
 */

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MessageCircle, Search } from "lucide-react";

import { useProgressRouter } from "@/components/layout/navigation-progress";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { OPEN_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/utils";

export type ShellPaletteItem = { href: string; label: string; group: string; icon?: React.ReactNode };

/** The look of the top-bar search field, shared with the admin palette's trigger. */
export const PALETTE_TRIGGER =
  "group flex min-h-11 w-full items-center gap-2.5 rounded-md border border-ink-300 bg-surface-raised px-3 text-sm text-ink-600 transition-colors duration-[var(--motion-fast)] hover:border-ink-400 hover:text-ink-900 md:max-w-[22rem]";
export const PALETTE_KBD = "hidden shrink-0 rounded-md border border-ink-300 bg-canvas px-1.5 py-0.5 font-sans text-2xs font-semibold text-ink-700 md:inline";

const noopSubscribe = () => () => {};
const isMacNow = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
/** null on the server and during hydration, so the hint is a neutral "K" until the browser is known. */
export function useModKey(): { hint: string; mod: string } {
  const mac = useSyncExternalStore(noopSubscribe, isMacNow, () => null);
  return { hint: mac === null ? "K" : mac ? "⌘K" : "Ctrl K", mod: mac ? "⌘" : "Ctrl" };
}

type Entry = { id: string; label: string; group: string; icon?: React.ReactNode; run: () => void };

export function ShellPalette({ items, withAssistant = false }: { items: ShellPaletteItem[]; withAssistant?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useProgressRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const uid = useId();
  const { hint } = useModKey();

  const remember = () => {
    const el = document.activeElement;
    returnFocus.current = el instanceof HTMLElement && el !== document.body ? el : triggerRef.current;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) remember();
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();
    const hit = (t: string) => !needle || t.toLowerCase().includes(needle);
    const out: Entry[] = [];
    if (withAssistant && hit("Ask Findy chat help")) {
      out.push({ id: "ask", label: "Ask Findy", group: "Help", icon: <MessageCircle />, run: () => window.dispatchEvent(new Event(OPEN_CHAT_EVENT)) });
    }
    for (const i of items) {
      if (hit(i.label) || hit(i.group)) out.push({ id: i.href, label: i.label, group: i.group, icon: i.icon, run: () => router.push(i.href) });
    }
    return out;
  }, [items, query, withAssistant, router]);

  const current = Math.min(active, Math.max(entries.length - 1, 0));
  const optionId = (i: number) => `${uid}-opt-${i}`;
  useEffect(() => {
    if (open) document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current]);

  const choose = (e: Entry) => {
    close();
    e.run();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!entries.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % entries.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + entries.length) % entries.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(entries[current]);
    }
  };

  // Group headings appear where the group changes.
  let lastGroup = "";
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => {
          remember();
          setOpen(true);
        }}
        className={cn(PALETTE_TRIGGER, "max-md:size-11 max-md:justify-center max-md:border-transparent max-md:bg-transparent max-md:px-0")}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden min-w-0 flex-1 truncate text-left md:block">Search pages</span>
        <span className="sr-only md:hidden">Search pages</span>
        <span className="sr-only"> (Command K)</span>
        <kbd aria-hidden className={PALETTE_KBD}>{hint}</kbd>
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (returnFocus.current ?? triggerRef.current)?.focus();
          }}
          className="top-[12%] translate-y-0 gap-0 overflow-hidden rounded-lg border-ink-300 bg-surface-raised p-0 shadow-[var(--shadow-float)] sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Search pages</DialogTitle>
          <DialogDescription className="sr-only">Type to filter pages. Use the arrow keys to move and Enter to open.</DialogDescription>
          <div className="flex items-center border-b border-ink-300 py-2 pl-4 pr-14">
            <Search className="mr-3 size-5 shrink-0 text-ink-600" aria-hidden />
            <input
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${uid}-list`}
              aria-activedescendant={entries.length ? optionId(current) : undefined}
              aria-autocomplete="list"
              aria-label="Search pages"
              value={query}
              maxLength={64}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Where to?"
              autoComplete="off"
              className="min-h-11 w-full bg-transparent font-display text-lg text-ink-900 placeholder:text-ink-600 focus:outline-hidden"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            <div id={`${uid}-list`} role="listbox" aria-label="Results">
              {entries.map((entry, i) => {
                const heading = entry.group !== lastGroup ? entry.group : null;
                lastGroup = entry.group;
                return (
                  <div key={entry.id} role="presentation">
                    {heading ? (
                      <div aria-hidden className="flex items-center gap-2 px-3 pb-1 pt-3 text-xs font-medium text-ink-600">
                        {heading}
                        <span className="h-px flex-1 bg-ink-200" />
                      </div>
                    ) : null}
                    <div
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === current}
                      tabIndex={-1}
                      onClick={() => choose(entry)}
                      onMouseMove={() => setActive(i)}
                      className={cn(
                        "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border px-2 py-1.5 text-left text-sm",
                        i === current ? "border-ink-300 bg-canvas text-ink-900" : "border-transparent text-ink-700",
                      )}
                    >
                      <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-4", i === current ? "bg-brand-800 text-canvas" : "text-ink-500")}>
                        {entry.icon ?? <Search />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                      {i === current ? <kbd aria-hidden className="rounded-md border border-ink-300 px-1.5 font-sans text-2xs font-semibold text-ink-700">↵</kbd> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {entries.length === 0 ? (
              <p role="status" className="px-3 py-6 text-center text-sm text-ink-600">
                No page matches &ldquo;{query.trim()}&rdquo;
              </p>
            ) : null}
          </div>
          <div aria-hidden className="hidden items-center gap-4 border-t border-ink-300 px-4 py-2 text-xs text-ink-600 sm:flex">
            <span><kbd className="font-sans font-semibold">↑↓</kbd> move</span>
            <span><kbd className="font-sans font-semibold">↵</kbd> open</span>
            <span className="ml-auto"><kbd className="font-sans font-semibold">Esc</kbd> close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
