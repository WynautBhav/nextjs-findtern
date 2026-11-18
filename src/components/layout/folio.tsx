"use client";

import { useSyncExternalStore } from "react";

const hm = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const minuteClock = (cb: () => void) => {
  const t = setInterval(cb, 20_000);
  return () => clearInterval(t);
};

/** The time in India, e.g. "11:42 am". Empty on the server so it can never mismatch on hydration. */
export function useIndiaTime(): string {
  return useSyncExternalStore(minuteClock, () => hm.format(new Date()), () => "");
}

/** The dateline in the top bar: the time in India (interviews and payouts run on IST). The sidebar already names the desk and the page header carries the date, so neither is repeated. */
export function Folio({ className }: { className?: string }) {
  const now = useIndiaTime();
  return now ? (
    <p className={className}>
      India time <time className="nums font-semibold text-ink-900">{now}</time>
    </p>
  ) : null;
}
