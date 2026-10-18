"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";


import { ButtonLink } from "@/components/ui/button";
import { GetStartedMenu } from "@/components/layout/get-started-menu";
import { NAV_LINKS, SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

/**
 * Site header.
 *
 * The previous version had ten elements in the bar: six links, "Get Started",
 * "For Employers", "For Interns", and a Login control. That is why it read as
 * cluttered. The measured convention across 28 premium sites is a median of
 * five to six links plus ONE call to action, in a 64px bar.
 *
 * The employer/candidate split is the specific thing that was costing the most
 * space, because it was two more buttons competing with the primary action.
 * It now lives in the hero, where each audience gets its own argument instead
 * of two nav buttons arguing over the same strip. Wellfound - the closest
 * analogue in the whole set, and also a two-sided job marketplace - does
 * exactly this.
 *
 * Retained from the legacy build: the six primary links, a single prominent
 * signup action, and a login entry point. Rebuilt on Radix via shadcn's Sheet
 * for the mobile menu, so the focus trap, escape handling, scroll lock and
 * aria-modal are no longer hand-rolled and no longer ours to get wrong.
 *
 * Mobile is a sheet *below* the bar, not a full-screen takeover: the logo,
 * login and signup stay on screen and interactive while the menu is open.
 * That is the Linear pattern (`.TZTsQG_mobileMenuContent { top:
 * calc(var(--header-height) + 1px) }`) and the only one of the measured
 * patterns that keeps the CTA visible.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // A scroll-position check. Not a scroll listener: `addEventListener("scroll")`
    // fires on every frame the user scrolls, and each call here would queue a
    // React state update - the jank-prone pattern this project bans everywhere
    // else. An IntersectionObserver on a sentinel at the top of the document
    // asks the same question once per crossing instead of 60 times a second.
    const sentinel = document.createElement("div");
    sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;";
    document.body.prepend(sentinel);

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, []);

  // Close the panel on navigation. Keying off the pathname means this is a
  // derived value rather than a synchronised copy of it, so it does not need
  // an effect at all.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={cn(
        // Scrolling is the highest-frequency action on the page, so the header
        // has to settle fast. 500ms read as lag on every scroll pass; 180ms is
        // short enough that the change stops registering as motion at all.
        "sticky top-0 z-50 w-full transition-[background-color,box-shadow,border-color,backdrop-filter] duration-[180ms] ease-ease-out-expo",
        scrolled || open
          ? "border-b border-ink-200/70 bg-white/85 shadow-[0_1px_0_0_rgb(7_47_36/0.04),0_10px_30px_-14px_rgb(7_47_36/0.16)] backdrop-blur-lg backdrop-saturate-150"
          : "border-b border-transparent bg-white/55 backdrop-blur-md",
      )}
    >
      {/* 64px, per the measured cluster. The legacy header was 64px but
          constant, with no scroll state at all. */}
      <div
        className={cn(
          "container-page flex items-center justify-between gap-4 transition-[height] duration-[180ms] ease-ease-out-expo",
          scrolled ? "h-16" : "h-20",
        )}
      >
        {/* ── Wordmark / Official Logo ─────────────────────────────── */}
        <Link
          href="/"
          aria-label="Findtern - home"
          className="group flex shrink-0 items-center transition-opacity duration-200 hover:opacity-90"
        >
          <Logo
            alt="Findtern - Internship Simplified"
            priority
            className={cn("transition-all duration-200", scrolled ? "h-8" : "h-9.5")}
          />
        </Link>

        {/* ── Primary nav ──────────────────────────────────────────── */}
        <nav aria-label="Primary" className="hidden lg:block">
          {/* Pill links. Wellfound's measured treatment: 14px/500, 8px 14px
              padding, 999px radius, with a 6% ink hover fill. */}
          <ul className="flex items-center gap-0.5">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative block rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200",
                      active
                        ? "bg-ink-100 text-primary"
                        : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Actions: one control for both audiences ────────────────
            "Log in" and "Get Started" were two CTAs for one intent, so they
            competed and neither said which door to use. They are now a single
            "Get started" menu that asks. */}
        <div className="flex shrink-0 items-center gap-1">
          <GetStartedMenu className="hidden sm:inline-flex" />

          {/* ── Mobile toggle ────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="ml-1 inline-flex size-10 items-center justify-center rounded-lg text-ink-800 transition-colors hover:bg-ink-100 lg:hidden"
          >
            {open ? (
              <X className="size-5" aria-hidden />
            ) : (
              <span className="flex flex-col gap-1.5" aria-hidden>
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Mobile panel: in flow, below the bar ─────────────────────
          Not an overlay and not a full-screen takeover, so the wordmark, log
          in and Get Started all stay visible and reachable. Height is
          measured and animated rather than guessed. */}
      <div
        id="mobile-nav"
        className={cn(
          "grid overflow-hidden border-t border-ink-100 bg-white transition-[grid-template-rows,opacity] duration-300 ease-ease-out-expo lg:hidden",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <nav aria-label="Mobile" className="container-page py-4">
            <ul className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between border-b border-ink-100 py-3.5 text-base font-medium transition-colors",
                      isActive(link.href) ? "text-primary" : "text-ink-700",
                    )}
                  >
                    {link.label}
                    <ChevronRight className="size-4 text-ink-300" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>

            {/* The two-sided split still needs to exist somewhere on mobile, but it is
                an audience choice, not a conversion CTA. */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <ButtonLink href="/employers" variant="outline" size="sm" block>
                Employers
              </ButtonLink>
              <ButtonLink href="/interns" variant="primary" size="sm" block>
                Interns
              </ButtonLink>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-ink-600 transition-colors hover:text-primary"
              >
                Sign in
              </Link>
              <a
                href={`mailto:${SITE.email}`}
                className="text-sm text-text-subtle transition-colors hover:text-primary"
              >
                {SITE.email}
              </a>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
