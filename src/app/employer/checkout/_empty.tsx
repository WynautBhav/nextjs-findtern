import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SuccessMoment } from "@/components/app/success-moment";
import { buttonClass } from "@/components/ui/button";

/**
 * Checkout when there is nothing to pay on the page: a statement, not a card. The title is the headline, the body says
 * why, `path` (optional) draws how an offer gets here, and the next action is the one filled button. `success` is the
 * paid receipt: the one celebratory moment of the money flow, drawn client-side when the page arrives with ?paid=1.
 */
export function CheckoutEmpty({
  title,
  body,
  who,
  next,
  secondary,
  path,
  success = false,
}: {
  title: string;
  body: string;
  /** Who acts next, as `You - do this`. */
  who?: string;
  next: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** How an offer reaches checkout, in order; `note` says where this company stands on that step. */
  path?: { label: string; note?: string }[];
  success?: boolean;
}) {
  const [actor, ...rest] = who ? who.split(" - ") : [];
  const primary = (
    <Link href={next.href} className={buttonClass({ size: "md" })}>
      {next.label}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
  const quiet = secondary ? (
    <Link href={secondary.href} className="inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-brand-700 underline underline-offset-4 outline-none hover:text-brand-900 focus-visible:ring-2 focus-visible:ring-brand-600">
      {secondary.label}
    </Link>
  ) : null;

  return (
    <section aria-labelledby={success ? undefined : "checkout-empty-title"} className="max-w-2xl border-t border-ink-200 pt-8">
      {success ? (
        <SuccessMoment
          title={title}
          body={body}
          actions={
            <>
              {primary}
              {quiet}
            </>
          }
        />
      ) : (
        <>
          <h2 id="checkout-empty-title" className="text-balance font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">
            {title}
          </h2>
          <p className="mt-2 max-w-lg text-pretty text-base text-ink-700">{body}</p>
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
          {path ? (
            <ol aria-label="How an offer reaches checkout" className="mt-6 divide-y divide-ink-200 border-y border-ink-200">
              {path.map((step, i) => (
                <li key={step.label} className="flex items-baseline gap-4 py-3">
                  <span aria-hidden className="nums w-5 font-display text-lg font-semibold text-ink-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-base text-ink-900">{step.label}</span>
                  {step.note ? <span className="nums shrink-0 text-sm font-medium text-[#9a4a08]">{step.note}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1">
            {primary}
            {quiet}
          </div>
        </>
      )}
    </section>
  );
}
