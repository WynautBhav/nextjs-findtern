"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  Globe,
  GraduationCap,
  History,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  ScrollText,
  Search,
  Send,
  Settings,
  Shield,
  ShoppingBag,
  Tag,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { invoiceHref, SEARCH_MIN, type SearchResponse } from "@/lib/admin/palette-search";
import { cn } from "@/lib/utils";

/** One sidebar link the signed-in admin may open (already permission-filtered by the layout). */
export type PaletteItem = { href: string; label: string; group: string };

type Entry = { id: string; label: string; sublabel?: string; href: string; icon: typeof Search };
type Section = { key: string; title: string; entries: Entry[] };

const ICONS: Record<string, typeof Search> = {
  "/admin/dashboard": LayoutDashboard,
  "/admin/proposal-tracker": Send,
  "/admin/messages": MessageSquare,
  "/admin/payouts": CreditCard,
  "/admin/interns": Users,
  "/admin/users": UserCheck,
  "/admin/companies": Building2,
  "/admin/colleges": GraduationCap,
  "/admin/projects": Briefcase,
  "/admin/orders": ShoppingBag,
  "/admin/intern-invoices": Receipt,
  "/admin/transactions": ArrowLeftRight,
  "/admin/promo-codes": Tag,
  "/admin/reports": BarChart3,
  "/admin/cms": Globe,
  "/admin/notifications": Bell,
  "/admin/notification-history": History,
  "/admin/settings": Settings,
  "/admin/cms/terms": ScrollText,
  "/admin/roles": Shield,
};

/**
 * Shortcuts that jump to a filtered view. Each only appears when the page it
 * opens (`base`) is in the admin's own nav, so it never offers a dead end.
 * The payouts page has no overdue filter, so that action opens the ledger
 * filtered to payouts still pending.
 */
const ACTIONS: { label: string; base: string; href: string }[] = [
  { label: "Go to candidates that need a score", base: "/admin/interns", href: "/admin/interns?ai=completed&score=none" },
  { label: "Go to pending payouts", base: "/admin/payouts", href: "/admin/payouts?status=pending" },
  { label: "Compose a notification", base: "/admin/notifications", href: "/admin/notifications" },
];

type SearchState = { q: string; status: "ok" | "error"; data: SearchResponse | null };

const RECORD_GROUPS = [
  { key: "candidates", title: "Candidates", icon: Users },
  { key: "companies", title: "Companies", icon: Building2 },
  { key: "invoices", title: "Invoices", icon: FileText },
] as const;

function sections(items: PaletteItem[], q: string, search: SearchState | null): Section[] {
  const needle = q.toLowerCase();
  const matches = (text: string) => !needle || text.toLowerCase().includes(needle);
  const out: Section[] = [];

  const actions = ACTIONS.filter((a) => items.some((i) => i.href === a.base) && matches(a.label)).map((a) => ({
    id: a.href,
    label: a.label,
    href: a.href,
    icon: Zap,
  }));
  if (actions.length) out.push({ key: "actions", title: "Actions", entries: actions });

  const byGroup = new Map<string, Entry[]>();
  for (const i of items) {
    if (!matches(i.label) && !matches(i.group)) continue;
    const list = byGroup.get(i.group) ?? [];
    list.push({ id: i.href, label: i.label, href: i.href, icon: ICONS[i.href] ?? Search });
    byGroup.set(i.group, list);
  }
  for (const [title, entries] of byGroup) out.push({ key: `nav-${title}`, title, entries });

  if (search?.data) {
    for (const g of RECORD_GROUPS) {
      const hits = search.data[g.key];
      if (!Array.isArray(hits) || hits.length === 0) continue;
      out.push({
        key: `rec-${g.key}`,
        title: g.title,
        entries: hits.map((h) => ({
          id: `${g.key}-${h.id}`,
          label: h.label,
          sublabel: h.sublabel,
          icon: g.icon,
          href:
            g.key === "candidates"
              ? `/admin/interns/${encodeURIComponent(h.id)}`
              : g.key === "companies"
                ? `/admin/companies/${encodeURIComponent(h.id)}`
                : invoiceHref(h as SearchResponse["invoices"][number]),
        })),
      });
    }
  }
  return out;
}

const noopSubscribe = () => () => {};
const isMacNow = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState<SearchState | null>(null);
  const router = useRouter();
  // The palette is not a DialogTrigger child, so Radix cannot restore focus itself: remember where it was opened from.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openPalette = () => {
    const el = document.activeElement;
    returnFocus.current = el instanceof HTMLElement && el !== document.body ? el : triggerRef.current;
    setOpen(true);
  };

  // null on the server and during hydration, so the hint is a neutral "K" until the browser is known.
  const mac = useSyncExternalStore(noopSubscribe, isMacNow, () => null);
  const hint = mac === null ? "K" : mac ? "⌘K" : "Ctrl K";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            const el = document.activeElement;
            returnFocus.current = el instanceof HTMLElement && el !== document.body ? el : triggerRef.current;
          }
          return !prev;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const q = query.trim();
  const wantsSearch = q.length >= SEARCH_MIN;

  // Debounced record search; typing again, closing or unmounting cancels the pending call and the request.
  useEffect(() => {
    if (!wantsSearch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: controller.signal, credentials: "same-origin" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SearchResponse;
        setSearch({ q, status: "ok", data });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setSearch({ q, status: "error", data: null });
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, wantsSearch]);

  // Results belong to the query that produced them: a different query means "still searching", never stale rows.
  const settled = wantsSearch && search?.q === q ? search : null;
  const loading = wantsSearch && !settled;
  const failed = settled?.status === "error";

  const list = useMemo(() => sections(items, q, settled), [items, q, settled]);
  const flat = useMemo(() => list.flatMap((s) => s.entries), [list]);
  const current = Math.min(active, Math.max(flat.length - 1, 0));
  const optionId = (i: number) => `admin-command-${i}`;

  // Keep the highlighted option on screen as the arrow keys move past the visible rows.
  useEffect(() => {
    if (open) document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  }, [open, current]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // A fresh search each time; Radix returns focus to the trigger on close.
    if (!next) {
      setQuery("");
      setActive(0);
      setSearch(null);
    }
  };

  const navigateTo = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + flat.length) % flat.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(flat.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      navigateTo(flat[current].href);
    }
  };

  const status = failed
    ? "Search is unavailable"
    : loading
      ? "Searching records…"
      : flat.length === 0
        ? "No matches"
        : null;

  // First option number of each section, so every row's id matches its place in `flat`.
  const starts = list.reduce<number[]>((acc, s, n) => [...acc, n === 0 ? 0 : acc[n - 1] + list[n - 1].entries.length], []);

  return (
    <>
      {/* The top bar's search field: a button drawn as a field, so the whole bar opens the palette. The
          combobox (role, listbox, active descendant) lives on the input inside the dialog. */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={openPalette}
        className="apple-spring flex min-h-11 w-full items-center gap-2.5 rounded-full border border-[var(--admin-panel-edge)] bg-[var(--admin-panel)] px-4 py-2 text-sm text-text-subtle hover:text-foreground md:max-w-[26rem]"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        {/* No aria-label: the name comes from the visible words plus the hidden hint, so the two can
            never disagree (WCAG 2.5.3, and engines differ on which of two spans they count as visible). */}
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="md:hidden">Search</span>
          <span className="hidden md:inline">Search candidates, companies, pages</span>
        </span>
        <span className="sr-only"> (Command K)</span>
        <kbd aria-hidden className="hidden shrink-0 rounded-md bg-[var(--admin-panel-2)] px-1.5 py-1 font-sans text-2xs font-semibold text-ink-600 md:inline">
          {hint}
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (returnFocus.current ?? triggerRef.current)?.focus();
          }}
          className="top-[12%] translate-y-0 gap-0 overflow-hidden rounded-apple-xl border-ink-200 bg-card p-0 shadow-tile sm:max-w-lg">
          <DialogTitle className="sr-only">Search the admin portal</DialogTitle>
          <DialogDescription className="sr-only">
            Type to filter pages and actions. With two or more characters, candidates, companies and invoices are searched too. Use the arrow keys to move and Enter to open.
          </DialogDescription>
          <div className="flex items-center border-b border-ink-200 py-1 pl-3 pr-14">
            <Search className="mr-3 size-4 shrink-0 text-ink-600" aria-hidden />
            <input
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="admin-command-list"
              aria-activedescendant={flat.length ? optionId(current) : undefined}
              aria-autocomplete="list"
              aria-label="Search the admin portal"
              value={query}
              maxLength={64}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Jump to a page, or find a candidate, company or invoice"
              autoComplete="off"
              className="min-h-11 w-full bg-transparent text-base text-ink-900 placeholder:text-text-subtle focus:outline-hidden sm:text-sm"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            <div id="admin-command-list" role="listbox" aria-label="Results">
              {list.map((section, n) => (
                <div key={section.key} role="group" aria-labelledby={`admin-command-group-${section.key}`} className="pb-2">
                  <div id={`admin-command-group-${section.key}`} className="px-3 py-1.5 text-xs font-medium text-text-subtle">
                    {section.title}
                  </div>
                  {section.entries.map((entry, k) => {
                    const i = starts[n] + k;
                    const Icon = entry.icon;
                    return (
                      <div
                        key={entry.id}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === current}
                        tabIndex={-1}
                        onClick={() => navigateTo(entry.href)}
                        onMouseMove={() => setActive(i)}
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-apple-sm px-3 py-2 text-left text-sm",
                          i === current ? "bg-ink-100 text-ink-900" : "text-ink-700",
                        )}
                      >
                        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-apple-sm bg-ink-100 text-ink-600">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink-900">{entry.label}</span>
                          {entry.sublabel ? <span className="block truncate text-xs text-text-subtle">{entry.sublabel}</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {status ? (
              <p role="status" className={cn("px-3 text-center text-sm text-text-subtle", flat.length ? "py-2" : "py-6")}>
                {status}
              </p>
            ) : null}
          </div>

          <div aria-hidden className="flex items-center justify-between border-t border-ink-200 px-3 py-2 text-xs text-text-subtle">
            <span>↑↓ to move · Enter to open</span>
            <span>Esc to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
