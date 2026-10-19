import Link from "next/link";
import { GraduationCap } from "lucide-react";

/**
 * Split auth shell.
 *
 * One layout for all three sign-in surfaces (intern, employer, admin) so the
 * three never drift apart visually.
 *
 * Left panel is the brand: dark, textured, carrying the value prop and a live
 * artifact rather than stock art. Right panel is the form, constrained to a
 * comfortable measure and vertically centred. On mobile the brand panel drops
 * to a compact header so the form is never pushed below two screens of scroll.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Employer and admin are internal surfaces - they do not get the pitch. */
  compact?: boolean;
}) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ─────────────────────────────────────────── */}
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-brand-950 px-8 py-10 text-white sm:px-12 lg:flex lg:px-16">
        {/* Two radial washes + a fine grid. Layered rather than a single flat
            fill, so the large dark area reads as a surface instead of a void. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_55%_at_12%_0%,rgb(22_107_84/0.65)_0%,transparent_62%),radial-gradient(ellipse_60%_50%_at_88%_8%,rgb(240_178_74/0.14)_0%,transparent_58%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]"
        />

        <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-full bg-white/10">
            <GraduationCap className="size-4 text-accent-300" aria-hidden />
          </span>
          Findtern
        </Link>

        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-300">{eyebrow}</p>
          <h2 className="mt-4 text-balance text-3xl font-medium leading-[1.1] tracking-[-0.03em] sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-on-dark-subtle">{subtitle}</p>

          {/* Artifact, not decoration. This is the same score card the hero
              shows, so the promise in the pitch is the thing they will see in
              the product. Suppressed on internal surfaces - an admin signing in
              does not need the sales pitch, and repeating it there would be
              noise on a screen people open forty times a day. */}
          {compact ? null : (
            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-on-dark-subtle">
                Findtern Score
              </p>
              <p className="mt-3 text-4xl font-semibold tracking-tight">
                8.4<span className="text-lg text-on-dark-subtle">/10</span>
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[84%] rounded-full bg-accent-400" />
              </div>
              <p className="mt-4 text-sm text-on-dark-subtle">
                One assessment. A published rate. No negotiation.
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-on-dark-subtle">
          © {new Date().getFullYear()} Findtern ·{" "}
          <Link href="/terms-and-conditions" className="underline underline-offset-4 hover:text-white">
            Terms
          </Link>
        </p>
      </aside>

      {/* ── Form panel ──────────────────────────────────────────── */}
      <main id="main" tabIndex={-1} className="outline-none flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Compact brand lockup, mobile only. */}
          <Link href="/" className="mb-10 inline-flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-full bg-brand-700">
              <GraduationCap className="size-4 text-white" aria-hidden />
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink-900">Findtern</span>
          </Link>

          {children}

          {footer ? <div className="mt-8 border-t border-ink-100 pt-6">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}