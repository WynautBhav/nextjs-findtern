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

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

import { Pill, Surface } from "@/components/app/primitives";
import type { Readiness } from "@/lib/journey";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ButtonLink } from "@/components/ui/button";

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
              "apple-spring h-2 flex-1 origin-left rounded-full",
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
              className="apple-spring group flex min-h-14 items-center gap-3 py-2.5"
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
                    <Pill tone="waiting" className="shrink-0 whitespace-nowrap">Needed for pay</Pill>
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
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const pct = Math.round(readiness.visible * 100);
  const nextHidden = readiness.items.find((i) => !i.done);
  const missingItems = readiness.items.filter((i) => !i.done);

  return (
    <>
      <Surface className={cn("p-5", className)}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[13px] font-medium text-ink-500">Profile completeness</h2>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Checklist
          </button>
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink-900">{pct}%</p>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completeness"
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-100"
        >
          <motion.div
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-primary"
          />
        </div>

        {nextHidden ? (
          <p className="mt-3 text-pretty text-[13px] leading-relaxed text-ink-600">
            Next: <span className="font-medium text-ink-900">{nextHidden.label}</span>.{" "}
            {nextHidden.unlocks}{" "}
            <a href={nextHidden.href} className="font-medium text-primary hover:underline">
              Add it
            </a>
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-ink-600">Complete. Every employer search can find you.</p>
        )}
      </Surface>

      {/* Profile completion full checklist dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-ink-950">
              Profile Completion Checklist
            </DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">
              Your profile is <strong className="text-ink-900">{pct}% complete</strong>.
              {missingItems.length > 0
                ? ` It’s not 100% yet because ${missingItems.length} requirement${missingItems.length === 1 ? " is" : "s are"} missing.`
                : " All requirements are complete!"}
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 max-h-[50vh] overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin]">
            {readiness.items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-[10px] p-2.5 text-xs transition-colors",
                  item.done ? "bg-ink-50/60" : "bg-accent-50/40 border border-accent-200/50"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full text-white text-xs",
                      item.done ? "bg-brand-600" : "bg-ink-300"
                    )}
                  >
                    {item.done ? <Check className="size-3" strokeWidth={3} /> : <EyeOff className="size-3 text-ink-600" />}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("font-medium truncate", item.done ? "text-ink-700" : "text-ink-900 font-semibold")}>
                      {item.label}
                    </p>
                    {!item.done && item.unlocks ? (
                      <p className="text-2xs text-text-subtle">{item.unlocks}</p>
                    ) : null}
                  </div>
                </div>

                {item.done ? (
                  <span className="shrink-0 text-2xs font-semibold text-brand-700 flex items-center gap-1">
                    <Eye className="size-3" /> Visible
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="apple-spring shrink-0 rounded-[8px] bg-brand-700 px-2.5 py-1 text-2xs font-semibold text-white hover:bg-brand-800"
                  >
                    Complete
                  </Link>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between gap-2 border-t border-ink-100 pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="apple-spring rounded-lg border border-ink-200 px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"
            >
              Close
            </button>
            {pct < 100 ? (
              <ButtonLink
                href="/intern/onboarding"
                size="sm"
                variant="primary"
                onClick={() => setOpen(false)}
                className="text-xs"
              >
                Complete Now
              </ButtonLink>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
