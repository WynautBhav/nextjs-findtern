import { buttonClass } from "@/components/ui/button";

/**
 * Class strings shared by the proposal screens (list, detail, composer): one outline button and one
 * field, flat on the paper canvas (the shared outline variant is a translucent glass chip).
 */
export const btnOutline = buttonClass({
  variant: "outline",
  size: "sm",
  className: "min-h-11 border-ink-300 bg-surface-raised text-ink-900 backdrop-blur-none hover:border-ink-400 hover:bg-ink-100 hover:shadow-none sm:min-h-9 touch:min-h-11",
});

/** Search box and filter select: 44px on phones, flat raised surface, the brand focus ring. */
export const searchFieldClass =
  "min-h-11 w-full rounded-md border border-ink-300 bg-surface-raised px-3 text-base text-ink-900 outline-none transition-colors placeholder:text-ink-600 hover:border-ink-400 focus-visible:border-brand-800 focus-visible:ring-2 focus-visible:ring-brand-700 sm:min-h-10 sm:text-sm";

/** A text input, select or textarea in the composer and the offer editor: 44px, flat raised surface, the brand focus ring. */
export const inputClass =
  "min-h-11 w-full rounded-md border border-ink-300 bg-surface-raised px-3 text-base text-ink-900 outline-none transition-colors placeholder:text-ink-600 hover:border-ink-400 focus-visible:border-brand-800 focus-visible:ring-2 focus-visible:ring-brand-700 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-600 md:text-sm";
