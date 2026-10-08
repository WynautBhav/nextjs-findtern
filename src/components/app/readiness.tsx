"use client";

/**
 * Readiness.
 *
 * Replaces the legacy "profile completion, 23 of 30" meter.
 *
 * ── The change that matters ────────────────────────────────────────────
 *
 * A percentage tells a candidate they are behind. It is a sentence about the
 * person, delivered by a product they have not yet been paid by, on the
 * screen they open when they are already anxious. Worse, its denominator is
 * arbitrary: nothing external decided that a profile needs thirty fields, so
 * the bar is a number the product invented and then held them under.
 *
 * This says something else, and it is checkable: what an employer can see
 * right now, and what stays hidden until it is filled. Same rows, same
 * database, opposite direction of travel. "Add your Aadhaar so your stipend
 * can be paid" is a reason. "You are at 70 percent" is a verdict.
 *
 * ── Why a segmented bar and not a ring ──────────────────────────────────
 *
 * A ring is a score you can fail. Segments are things that are individually
 * true or false, and hovering one tells you which. The whole argument of this
 * component is that progress here is a set of facts rather than a score, so
 * the visual has to agree.
 *
 * The bar fills once, quietly, on entry. It does not loop and it does not
 * animate every time you visit, because watching a bar you have already seen
 * fill is noise wearing the costume of motivation.
 */

import { motion, useReducedMotion } from "motion/react";
import { Check, Eye, EyeOff } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import type { Readiness } from "@/lib/journey";
import { cn } from "@/lib/utils";

export function ReadinessMeter({
  readiness,
  className,
}: {
  readiness: Readiness;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.round(readiness.visible * 100);

  return (
    <Surface className={cn("p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink-900">
          What employers can see
        </h2>
        <p className="text-sm font-medium tabular-nums text-ink-600">
          {readiness.hiddenCount === 0
            ? "Everything"
            : `${readiness.hiddenCount} still hidden`}
        </p>
      </div>

      <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-600">
        {readiness.hiddenCount === 0
          ? "Everything on this list is filled in, so nothing about you is hidden from a search."
          : "Nothing here is a test. Each one is a detail a recruiter is looking for and cannot see yet."}
      </p>

      {/* Segments. Each is one real item, individually focusable, so a keyboard
          or screen reader user gets the same information a mouse hover gives. */}
      <div
        className="relative mt-4 flex gap-1.5"
        role="img"
        aria-label={`${pct} percent of what employers can see is filled in`}
      >
        {/* When the list is complete, the bar gets one quiet amber sweep. It
            happens once, on entry, and never loops: the reward for finishing is
            the state itself, not a repeating animation. */}
        {readiness.hiddenCount === 0 && !reduce ? (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.9, x: "-100%" }}
            animate={{ opacity: 0, x: "100%" }}
            transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-accent-300/40 to-transparent"
          />
        ) : null}
        {readiness.items.map((item, i) => (
          <motion.span
            key={item.id}
            title={`${item.label}: ${item.done ? "visible" : "hidden"}`}
            initial={reduce ? false : { scaleX: 0.2, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{
              duration: 0.4,
              delay: reduce ? 0 : 0.05 + i * 0.035,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={cn(
              "h-2 flex-1 origin-left rounded-full transition-colors",
              item.done ? "bg-gradient-to-r from-brand-600 to-teal-600 shadow-2xs" : "bg-ink-200",
            )}
          />
        ))}
      </div>

      <ul className="mt-5 divide-y divide-ink-100">
        {readiness.items.map((item) => (
          <li key={item.id}>
            <a
              href={item.href}
              className="group flex min-h-14 items-center gap-3 py-2.5 transition-colors duration-[var(--dur-instant)]"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-inset",
                  item.done
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-ink-400 ring-ink-200",
                )}
              >
                {item.done ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : (
                  <EyeOff className="size-3.5" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      item.done ? "text-ink-600" : "text-ink-900",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.blocking && !item.done ? (
                    <span className="rounded-full bg-accent-100 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-accent-700">
                      Needed for pay
                    </span>
                  ) : null}
                </span>
                {!item.done && item.unlocks ? (
                  <span className="mt-0.5 block text-pretty text-sm leading-snug text-ink-500">
                    {item.unlocks}
                  </span>
                ) : null}
              </span>

              <span
                className={cn(
                  "shrink-0 text-xs font-semibold",
                  item.done ? "text-ink-400" : "text-primary",
                )}
              >
                {item.done ? (
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3.5" aria-hidden />
                    Visible
                  </span>
                ) : (
                  "Add"
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/**
 * The compact form, for the home screen.
 *
 * Says the one thing that matters and offers the next step. A candidate does
 * not open the app to admire a meter, they open it because something is
 * waiting, and this sits underneath that and gets out of the way.
 */
export function ReadinessStrip({
  readiness,
  className,
}: {
  readiness: Readiness;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.round(readiness.visible * 100);
  const nextHidden = readiness.items.find((i) => !i.done);

  return (
    <Surface className={cn("relative overflow-hidden p-5 border-ink-200/80 shadow-xs", className)}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-600 via-teal-500 to-emerald-400" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-ink-900">
          Profile Visibility
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-700 ring-1 ring-brand-600/20">
          {pct}% ready
        </span>
      </div>

      <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-ink-100 ring-1 ring-ink-200/50">
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-brand-700 via-teal-600 to-emerald-500"
        />
      </div>

      {nextHidden ? (
        <div className="mt-3.5 flex items-start justify-between gap-3">
          <p className="text-pretty text-xs leading-relaxed text-ink-600">
            <span className="font-semibold text-ink-900">{nextHidden.label}</span> is still missing.{" "}
            {nextHidden.unlocks}
          </p>
          <a
            href={nextHidden.href}
            className="shrink-0 rounded-md bg-brand-50 px-2 py-1 text-2xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            Add Now
          </a>
        </div>
      ) : (
        <p className="mt-3 text-pretty text-xs leading-relaxed text-emerald-700 font-medium">
          ✓ Profile is 100% visible and actively searchable by verified employers.
        </p>
      )}
    </Surface>
  );
}
