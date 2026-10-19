"use client";

import { useSyncExternalStore } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRICE_CURRENCIES, isPriceCurrency, type PriceCurrency } from "@/lib/currency";
import { formatMoney, formatRate, detectIsIndia } from "@/lib/format";
import {
  BANDS,
  bandsForRegion,
  type Band,
  type BandId,
} from "@/lib/score";
import { cn } from "@/lib/utils";

/**
 * Region-aware rates for marketing surfaces.
 *
 * The visitor's currency is one shared preference. It starts from their
 * timezone (India → INR, anywhere else → USD) and the visitor can change it
 * with the currency picker; the choice is remembered in localStorage and
 * every price on the page follows it at once. Timezone alone was not enough:
 * a VPN changes the IP, not the clock, so a US visitor testing from India
 * kept seeing rupees.
 *
 * INR shows the authored Indian rate card. Every other currency shows the
 * USD card - in USD, or converted for reference (lib/currency). Server
 * components render INR; the first client render matches it, so there is
 * no hydration mismatch.
 */

const KEY = "ft-currency";
const listeners = new Set<() => void>();

function readCurrency(): PriceCurrency {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && isPriceCurrency(stored)) return stored;
  } catch {
    // Storage blocked: fall through to the timezone default.
  }
  return detectIsIndia() ? "INR" : "USD";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setCurrency(next: PriceCurrency) {
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Not persisted, but still applied for this page view below.
  }
  overrideForSession = next;
  listeners.forEach((l) => l());
}

/** Used when storage is blocked, so a choice still sticks until reload. */
let overrideForSession: PriceCurrency | null = null;

export function useCurrency(): PriceCurrency {
  return useSyncExternalStore(
    subscribe,
    () => overrideForSession ?? readCurrency(),
    () => "INR",
  );
}

/** INR rate card or the USD one. Every non-INR currency derives from USD. */
export function useIsIndia(): boolean {
  return useCurrency() === "INR";
}

export function useRegionBands(): {
  isIndia: boolean;
  currency: PriceCurrency;
  bands: Band[];
} {
  const currency = useCurrency();
  const isIndia = currency === "INR";
  return { isIndia, currency, bands: bandsForRegion(isIndia) };
}

/** The INR band geometry, for layouts that must not move between regions. */
export { BANDS };

function bandById(bands: Band[], id: BandId): Band {
  return bands.find((b) => b.id === id) ?? bands[0];
}

/** Formatted hourly rate for a band id, in the visitor's currency. */
export function BandRate({ bandId, className }: { bandId: BandId; className?: string }) {
  const { bands, currency } = useRegionBands();
  return <span className={className}>{formatRate(bandById(bands, bandId).rateMinor, currency)}</span>;
}

/** Formatted per-hire charge for a band id. */
export function BandPerHire({ bandId }: { bandId: BandId }) {
  const { bands, currency } = useRegionBands();
  const band = bandById(bands, bandId);
  return <>{formatMoney(band.perHireMinor, currency)}</>;
}

/** One line under a price block saying what the shown currency means. */
export function CurrencyNote({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const currency = useCurrency();
  const text =
    currency === "INR"
      ? "Prices include GST."
      : currency === "USD"
        ? "Billed in US dollars. No hidden fees."
        : `Billed in US dollars. ${currency} shown at a reference rate.`;
  return <p className={cn("text-sm", tone === "dark" ? "text-on-dark-subtle" : "text-ink-600", className)}>{text}</p>;
}

/**
 * "Prices in ₹ INR ▾". A small menu, not a page-level control: the default is
 * almost always right, and this is the escape hatch.
 */
export function CurrencyPicker({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const currency = useCurrency();
  const dark = tone === "dark";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Prices shown in ${currency}. Change currency`}
          className={cn(
            "group/cur inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
            dark
              ? "border-white/20 text-on-dark hover:border-white/40 hover:text-white"
              : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900",
            className,
          )}
        >
          <span className={dark ? "text-on-dark-subtle" : "text-ink-600"}>Prices in</span>
          <span className="font-semibold tabular-nums">
            {symbolFor(currency)} {currency}
          </span>
          <ChevronDown className="size-3.5 transition-transform duration-150 group-data-[state=open]/cur:rotate-180" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={8} className="max-h-80 min-w-60 overflow-y-auto">
        {PRICE_CURRENCIES.map((c) => (
          <DropdownMenuItem
            key={c.code}
            onSelect={() => setCurrency(c.code)}
            role="menuitemradio"
            aria-checked={c.code === currency}
            className="justify-between gap-4"
          >
            <span className="flex items-center gap-2.5">
              <span className="w-9 font-semibold tabular-nums">{c.code}</span>
              <span className="font-normal text-ink-600">{c.label}</span>
            </span>
            <Check className={cn("size-4 text-primary", c.code === currency ? "opacity-100" : "opacity-0")} aria-hidden />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function symbolFor(code: PriceCurrency): string {
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? code;
  } catch {
    return code;
  }
}
