import Link from "next/link";

import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  XIcon,
} from "@/components/ui/social-icons";
import { FOOTER_SECTIONS, SITE } from "@/lib/content/site";
import { Logo } from "@/components/brand/logo";
import { ContactEmailLink } from "@/components/marketing/email-link";

/**
 * Site footer.
 *
 * Same four-column shape as the original - brand, then three link columns -
 * with three fixes:
 *  - the copyright year was hardcoded to "2026" in the legacy Footer.tsx and
 *    would silently go stale; it is now derived;
 *  - only /terms-and-conditions was linked, leaving the intern and employer
 *    terms pages orphaned and /privacy (linked from the auth pages) 404ing;
 *  - social links were four raw anchors with no accessible name beyond the
 *    icon, so they announced as unlabelled links.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="grain relative mt-auto overflow-hidden bg-brand-950 text-ink-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-on-dark-accent/40 to-transparent"
      />

      <div className="container-page py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_repeat(3,1fr)] lg:gap-10">
          {/* Brand */}
          <div className="max-w-sm">
            <Link href="/" aria-label="Findtern - home" className="inline-block">
              <Logo variant="white" className="h-14" />
            </Link>
            <p className="mt-5 text-base leading-relaxed text-on-dark-subtle">
              Your gateway to skilled interns, effortlessly. Verified
              candidates, transparent pricing, and paid engagements.
            </p>

            <ul className="mt-6 flex items-center gap-2.5">
              <Social href={SITE.social.facebook} label="Findtern on Facebook">
                <FacebookIcon />
              </Social>
              <Social href={SITE.social.instagram} label="Findtern on Instagram">
                <InstagramIcon />
              </Social>
              <Social href={SITE.social.x} label="Findtern on X">
                <XIcon />
              </Social>
              <Social href={SITE.social.linkedin} label="Findtern on LinkedIn">
                <LinkedinIcon />
              </Social>
            </ul>
          </div>

          {/* Link columns.
              The navs already carry aria-label, so a visible <h2> here was
              redundant and put the footer's column titles at the same outline
              level as the page's own sections. Demoted to <p>.

              Each link is an at-least-44px row rather than bare text - the previous
              inline links measured 21px and failed WCAG 2.5.8. Negative margin
              pulls the visual rhythm back to the original 12px pitch without
              shrinking the target. min-h + py rather than a fixed h-11, so a
              label that wraps ("Intern Non-Bypass Agreement") grows its row
              evenly instead of crowding its neighbours. */}
          {FOOTER_SECTIONS.map((section) => (
            <nav key={section.heading} aria-label={section.heading}>
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-accent">
                {section.heading}
              </p>
              <ul className="mt-2 -my-2.5 flex flex-col">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex min-h-11 items-center py-2 text-base leading-snug text-on-dark-subtle transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-subtle">
            {year} © Findtern. All rights reserved.
          </p>
          <p className="text-sm">
            <ContactEmailLink tone="dark" />
          </p>
        </div>
      </div>
    </footer>
  );
}

function Social({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={label}
        className="flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/5 text-on-dark-subtle transition-colors hover:border-on-dark-accent/50 hover:bg-accent/10 hover:text-on-dark-accent [&_svg]:size-4"
      >
        {children}
      </a>
    </li>
  );
}
