"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Popover } from "radix-ui";

import { cn } from "@/lib/utils";
import { DayCalendar } from "./day-calendar";
import { nextOpenDay } from "./day-calendar-model";

/**
 * A date field in DD/MM/YYYY, the one format the product shows (bug sheet 7,
 * DESIGN.md §0). The native date input follows the browser's language, so an
 * en-US browser showed mm/dd/yyyy on the offer and booking forms while
 * Schedule asked for DD/MM/YYYY (QA-126). The value in and out stays ISO
 * (YYYY-MM-DD); "" until the text is a real date. `min` / `max` are ISO too,
 * and a date outside them reports why rather than passing silently.
 *
 * A calendar button sits at the end of the field (bug sheet 9: "add calendar in
 * start date"): it opens the browser's own picker through a hidden date input,
 * as the intern forms do, and the picked day lands in the text as DD/MM/YYYY.
 *
 * `isDisabled` (days a rule forbids, such as weekends) swaps that native picker for a month calendar that greys those
 * days out, because the native control cannot. The button is then a real, focusable control (the typed field still
 * works too). The field reports the typed date as it is; the caller decides what to do with a day it refuses (it can
 * move it and say so).
 */

function toIso(text: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function DmyDateInput({
  value,
  onChange,
  min,
  max,
  isDisabled,
  className,
  ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max"> & {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  /** Days that cannot be picked; given, the calendar button opens a month grid with them greyed out. */
  isDisabled?: (iso: string) => boolean;
}) {
  const [text, setText] = useState(() => toDmy(value));
  // Follow a value set from outside (a reset, a prefill) without fighting
  // the half-typed text that maps to "".
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== toIso(text)) setText(toDmy(value));
  }
  const field = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // India's today, read when the calendar opens (not on every render).
  const [today, setToday] = useState("");

  function commit(next: string) {
    setText(next);
    const iso = toIso(next);
    const out = iso && ((min && iso < min) || (max && iso > max)) ? "" : iso;
    field.current?.setCustomValidity(
      next.trim() && !iso
        ? "Use DD/MM/YYYY, for example 31/10/2026."
        : iso && min && iso < min
          ? `Pick ${toDmy(min)} or later.`
          : iso && max && iso > max
            ? `Pick ${toDmy(max)} or earlier.`
            : "",
    );
    setSeen(out);
    onChange(out);
  }

  function openPicker() {
    const el = picker.current;
    if (!el || rest.disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  const name = rest["aria-label"];
  return (
    <div className="relative">
      <input
        {...rest}
        ref={field}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={rest.placeholder ?? "DD/MM/YYYY"}
        value={text}
        onChange={(e) => commit(e.target.value)}
        className={cn(className, "pr-12")}
      />
      {isDisabled ? (
        <Popover.Root
          open={open}
          onOpenChange={(o) => {
            if (o) setToday(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10));
            setOpen(o);
          }}
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={rest.disabled}
              aria-label={name ? `Open calendar, ${name}` : "Open calendar"}
              className="apple-spring absolute bottom-0.5 right-0.5 grid size-10 place-items-center rounded-apple-sm text-text-subtle outline-none hover:bg-ink-100 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 disabled:pointer-events-none"
            >
              <CalendarDays className="size-[1.125rem]" aria-hidden />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              collisionPadding={16}
              aria-label="Choose a date"
              className="z-[70] rounded-apple-lg border border-ink-200 bg-white p-3 shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
            >
              {today ? (
                <DayCalendar
                  selected={toIso(text)}
                  startDay={toIso(text) || nextOpenDay(today, isDisabled)}
                  today={today}
                  isDisabled={isDisabled}
                  note="Greyed-out days are unavailable."
                  onPick={(iso) => {
                    commit(toDmy(iso));
                    setOpen(false);
                  }}
                />
              ) : null}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : (
        <>
          {/* The picker never shows itself: the button below opens it. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={toIso(text)}
            min={min}
            max={max}
            onChange={(e) => {
              if (e.target.value) commit(toDmy(e.target.value));
            }}
            className="pointer-events-none absolute bottom-0.5 right-0.5 size-10 opacity-0"
          />
          <button
            type="button"
            onClick={openPicker}
            disabled={rest.disabled}
            // A mouse shortcut, hidden from assistive technology: the field itself takes the typed date, and inside a
            // <label> a visible button would be read out as part of the field's name ("Paid from Open calendar").
            aria-hidden
            aria-label={name ? `Open calendar, ${name}` : "Open calendar"}
            tabIndex={-1}
            className="apple-spring absolute bottom-0.5 right-0.5 grid size-10 place-items-center rounded-apple-sm text-text-subtle hover:bg-ink-100 hover:text-brand-700 disabled:pointer-events-none"
          >
            <CalendarDays className="size-[1.125rem]" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
