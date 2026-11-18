"use client";

/**
 * The pieces both app shells (ConsoleShell for intern, employer and college; AdminShell) are built
 * from, so the four roles read as one product: one rail look, one top bar, one phone tab bar,
 * one account menu, one quiet "Ask Findy" launcher.
 *
 * Rail: flat on the paper canvas, a hairline on its right edge. The current page is a solid
 * deep-green block with white text (readable at a glance, no coloured edge stripes). Group names
 * are sentence case. A count is a plain number in the signal colour, not a pill.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, LogOut, MessageCircle } from "lucide-react";

import { InternAvatar } from "@/components/intern/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { newTabAttrs } from "@/components/ui/new-tab";
import { NewTabHint } from "@/components/ui/new-tab-link";
import { initialsOf } from "@/lib/admin/person-tint";
import { OPEN_CHAT_EVENT } from "@/lib/chat-events";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** A count beside the label (unread, items waiting). Zero shows nothing. */
  badge?: number | string;
  /** Replaces the badge text when set (the admin rail ticks its numbers). `badge` must still be set. */
  badgeNode?: React.ReactNode;
  /** What the badge counts, said to screen readers ("due", "unread"). */
  badgeLabel?: string;
  /** A quiet dot: this needs the user, without turning it into a score. */
  attention?: boolean;
  /** Other paths this item stands for (one "Legal texts" item for four pages). */
  also?: string[];
  /** false for links out to the marketing site. */
  prefetch?: boolean;
  /** Opens in a new tab. */
  newTab?: boolean;
  /** Not open yet: lock glyph, and the href points at the page that explains it. */
  locked?: boolean;
  lockedNote?: string;
};
export type NavGroup = { title?: string; items: NavItem[] };

const LOCKED_TEXT = "Unlocks after payment";

/** The longest matching href wins, so /admin/interns/terms never also lights /admin/interns. */
export function activeHrefOf(items: NavItem[], pathname: string): string | undefined {
  return items
    .flatMap((i) => [i.href, ...(i.also ?? [])].map((p) => ({ path: p.split(/[#?]/)[0], href: i.href.split("#")[0] })))
    .filter(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.href;
}

const isActive = (href: string, active: string | undefined) => active === href.split("#")[0];

export function LockGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Rail scroller: keeps the links their size, scrolls, and brings the current page into view. A hairline marks hidden content (no fade: a faded last group looked broken). */
export function RailScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => setMore(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1);
    const current = nav.querySelector('[aria-current="page"]')?.getBoundingClientRect();
    const box = nav.getBoundingClientRect();
    if (current && current.bottom > box.bottom - 24) nav.scrollTop += current.top - box.top - (box.height - current.height) / 2;
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => {
      nav.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return (
    <nav
      ref={ref}
      aria-label="Main"
      className={cn(
        "-mx-1 mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain px-1 pb-3 [scrollbar-color:var(--color-ink-300)_transparent] [scrollbar-width:thin]",
        more && "border-b border-ink-200",
      )}
    >
      {children}
    </nav>
  );
}

export function RailGroup({ title, compact, children }: { title?: string; compact: boolean; children: React.ReactNode }) {
  return (
    <div>
      {title ? (
        compact ? <div aria-hidden className="mx-auto mb-2 h-px w-5 bg-ink-300" /> : <p className="mb-1.5 px-3 text-xs font-medium text-ink-500">{title}</p>
      ) : null}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

export function RailLink({ item, active, compact, onNavigate }: { item: NavItem; active: boolean; compact: boolean; onNavigate?: () => void }) {
  const locked = Boolean(item.locked);
  const mail = item.href.startsWith("mailto:");
  const className = cn(
    "group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-[var(--motion-fast)] [@media(pointer:fine)]:min-h-10",
    active ? "bg-brand-800 font-medium text-white" : "text-ink-700 hover:bg-ink-200/60 hover:text-ink-900",
    compact && "justify-center px-0",
  );
  const body = (
    <>
      <span className={cn("relative shrink-0 [&_svg]:size-[1.125rem]", active ? "text-white" : "text-ink-500 group-hover:text-ink-800")}>
        {item.icon}
        {compact && locked ? <LockGlyph className="absolute -right-1.5 -top-1.5 size-3 rounded-full bg-paper p-px text-ink-700" /> : null}
        {compact && !locked && (item.attention || item.badge) ? <span aria-hidden className="absolute -right-1 -top-1 size-2 rounded-full bg-signal ring-2 ring-paper" /> : null}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", compact && "sr-only")}>
        {item.label}
        {locked ? `, locked. ${item.lockedNote ?? LOCKED_TEXT}` : ""}
        {compact && item.attention ? ", needs you" : ""}
        {compact && item.badge ? `, ${item.badge} ${item.badgeLabel ?? "unread"}` : ""}
      </span>
      {!compact && locked ? (
        <LockGlyph className={cn("size-3.5 shrink-0", active ? "text-white/80" : "text-ink-500")} />
      ) : !compact && item.badge ? (
        <span className={cn("nums text-xs font-semibold", active ? "text-white" : "text-signal")}>
          {item.badgeNode ?? item.badge}
          <span className="sr-only"> {item.badgeLabel ?? "unread"}</span>
        </span>
      ) : !compact && item.attention ? (
        <span className="size-1.5 shrink-0 rounded-full bg-signal">
          <span className="sr-only">Needs you</span>
        </span>
      ) : null}
    </>
  );
  return mail ? (
    <a href={item.href} title={compact ? item.label : undefined} className={className}>
      {body}
    </a>
  ) : (
    <Link
      href={item.href}
      prefetch={item.prefetch}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-disabled={locked ? true : undefined}
      title={locked ? `${item.label}: ${item.lockedNote ?? LOCKED_TEXT}` : compact ? item.label : undefined}
      className={className}
      {...newTabAttrs(item.newTab)}
    >
      {body}
      {item.newTab ? <NewTabHint /> : null}
    </Link>
  );
}

/** Renders a nav group list with the right active item lit. */
export function RailGroups({ groups, pathname, compact, onNavigate }: { groups: NavGroup[]; pathname: string; compact: boolean; onNavigate?: () => void }) {
  const active = activeHrefOf(groups.flatMap((g) => g.items), pathname);
  return (
    <>
      {groups.map((g, i) => (
        <RailGroup key={g.title ?? i} title={g.title} compact={compact}>
          {g.items.map((item) => (
            <li key={item.href}>
              <RailLink item={item} active={isActive(item.href, active)} compact={compact} onNavigate={onNavigate} />
            </li>
          ))}
        </RailGroup>
      ))}
    </>
  );
}

/** Rail footer row (Sign out, FAQ): same metrics as a RailLink, never active. */
export const RAIL_FOOT = "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-ink-600 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/60 hover:text-ink-900 [@media(pointer:fine)]:min-h-10 [&>svg]:size-[1.125rem]";

/**
 * "Ask Findy": one quiet launcher, always the first control on the right of the top bar. Plain text
 * and a small speech-bubble icon (no mascot, no filled pill); the full chat opens from here.
 */
export function AskLauncher({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))}
      aria-label="Ask Findy, chat with Findy"
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-ink-800 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/60 max-sm:size-11 max-sm:justify-center max-sm:px-0",
        className,
      )}
    >
      <MessageCircle className="size-[1.125rem] text-brand-700" aria-hidden />
      <span className="max-sm:sr-only">Ask Findy</span>
    </button>
  );
}

/** A flat monochrome initials disc (or the person's photo). Never a pastel tint. */
export function UserDot({ name, photoUrl, className }: { name: string; photoUrl?: string | null; className?: string }) {
  return photoUrl ? (
    <InternAvatar src={photoUrl} initials={initialsOf(name)} className={cn("size-8 rounded-full text-xs", className)} />
  ) : (
    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-paper", className)}>
      {initialsOf(name)}
    </span>
  );
}

export type MenuLink = { href: string; label: string; icon: React.ReactNode; prefetch?: boolean; newTab?: boolean };

export function UserMenu({
  account,
  menu,
  onSignOut,
}: {
  account: { name: string; email: string; subtitle?: string; photoUrl?: string | null };
  menu: MenuLink[];
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex min-h-11 items-center gap-2 rounded-md px-1.5 text-left text-sm transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/60 sm:pr-2">
          <UserDot name={account.name} photoUrl={account.photoUrl} />
          <span className="sr-only md:not-sr-only md:block md:max-w-[14rem] md:truncate md:font-medium md:text-ink-900">{account.name}</span>
          <span className="sr-only">, account menu</span>
          <ChevronDown className="hidden size-4 text-ink-500 md:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <DropdownMenuLabel className="px-2 py-2 font-normal">
          <p className="truncate text-sm font-semibold text-ink-900">{account.name}</p>
          {account.subtitle ? <p className="truncate text-xs text-ink-600">{account.subtitle}</p> : null}
          <p className="truncate text-xs text-text-subtle">{account.email}</p>
        </DropdownMenuLabel>
        {menu.length ? <DropdownMenuSeparator /> : null}
        {menu.map((m) => (
          <DropdownMenuItem key={m.href} asChild>
            <Link href={m.href} prefetch={m.prefetch} {...newTabAttrs(m.newTab)} className="flex min-h-10 cursor-pointer items-center gap-2.5 [&_svg]:size-4 [&_svg]:text-ink-500">
              {m.icon}
              {m.label}
              {m.newTab ? <NewTabHint /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-danger focus:bg-danger-soft focus:text-danger">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Phone bottom bar: the role's real destinations (up to five) and a "More" that opens the full
 * navigation. The current page sits in a soft green capsule behind its icon.
 */
export function TabBar({ tabs, pathname, onMore, moreBadge }: { tabs: NavItem[]; pathname: string; onMore?: () => void; moreBadge?: number }) {
  const active = activeHrefOf(tabs, pathname);
  const cols = tabs.length + (onMore ? 1 : 0);
  const cell = "relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs";
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const on = isActive(item.href, active);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                aria-disabled={item.locked ? true : undefined}
                title={item.locked ? `${item.label}: ${item.lockedNote ?? LOCKED_TEXT}` : undefined}
                className={cn(cell, on ? "font-semibold text-brand-800" : "text-ink-600")}
              >
                <span className={cn("relative grid h-7 w-14 place-items-center rounded-full transition-colors duration-[var(--motion-fast)] [&_svg]:size-5", on && "bg-brand-100")}>
                  {item.icon}
                  {item.locked ? <LockGlyph className="absolute right-1.5 top-0 size-3 rounded-full bg-paper p-px text-ink-700" /> : null}
                  {item.attention || item.badge ? (
                    <span className="absolute right-2 top-0 size-2 rounded-full bg-signal ring-2 ring-paper">
                      <span className="sr-only">{item.badge ? `${item.badge} ${item.badgeLabel ?? "waiting"}` : "needs you"}</span>
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
                {item.locked ? <span className="sr-only">, locked. {item.lockedNote ?? LOCKED_TEXT}</span> : null}
              </Link>
            </li>
          );
        })}
        {onMore ? (
          <li>
            <button type="button" onClick={onMore} className={cn(cell, "w-full text-ink-600")} aria-label={moreBadge ? `More, ${moreBadge} waiting` : "More"}>
              <span className="relative grid h-7 w-14 place-items-center rounded-full [&_svg]:size-5">
                <Ellipsis aria-hidden />
                {moreBadge ? <span aria-hidden className="absolute right-2 top-0 size-2 rounded-full bg-signal ring-2 ring-paper" /> : null}
              </span>
              <span>More</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
