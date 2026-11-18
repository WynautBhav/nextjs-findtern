import Link from "next/link";
import { ArrowRight, ReceiptText, type LucideIcon } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

/**
 * Checkout's empty state: a compact centred card, not a full-width dashed box
 * with a few small words in the middle. The icon sits in a tinted circle, the
 * heading and body are readable (AA on white), one primary action resolves the
 * state and an optional quiet link goes the other way.
 */
export function CheckoutEmpty({
  title,
  body,
  who,
  next,
  secondary,
  icon: Icon = ReceiptText,
}: {
  title: string;
  body: string;
  /** Who acts next, as `You - do this`. */
  who?: string;
  next: { label: string; href: string };
  secondary?: { label: string; href: string };
  icon?: LucideIcon;
}) {
  const [actor, ...rest] = who ? who.split(" - ") : [];
  return (
    <section aria-labelledby="checkout-empty-title" className="mx-auto mt-6 flex w-full max-w-[560px] flex-col items-center rounded-2xl border border-ink-200 bg-white px-6 py-10 text-center shadow-xs sm:px-10 sm:py-12">
      <span className="grid size-16 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/70">
        <Icon className="size-8" aria-hidden />
      </span>
      <h2 id="checkout-empty-title" className="mt-5 text-balance text-xl font-semibold tracking-[-0.01em] text-ink-900">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-pretty text-base leading-relaxed text-ink-700">{body}</p>
      {who ? (
        <p className="mt-3 text-sm text-ink-700">
          {rest.length ? (
            <>
              <span className="font-semibold text-ink-900">{actor}:</span> {rest.join(" - ")}
            </>
          ) : (
            who
          )}
        </p>
      ) : null}
      <Link href={next.href} className={buttonClass({ className: "mt-7 h-11 rounded-xl px-5" })}>
        {next.label}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
      {secondary ? (
        <Link href={secondary.href} className="mt-3 inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-brand-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-600">
          {secondary.label}
        </Link>
      ) : null}
    </section>
  );
}
