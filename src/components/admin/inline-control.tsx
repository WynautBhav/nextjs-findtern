"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2, Pencil, X } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import {
  bodyForDraft,
  bodyForValue,
  draftFrom,
  typedDraft,
  type InlineDraft,
  type InlineField,
  type InlineRequest,
  type InlineValue,
} from "@/lib/admin/inline-request";
import { cn } from "@/lib/utils";

export type { InlineField, InlineRequest, InlineValue } from "@/lib/admin/inline-request";

/**
 * Inline row controls for admin lists (DESIGN.md §6.5).
 *
 * Adapted from the Watermelon `inline-table-control` pattern: the edit opens
 * in place, inside the row, and never moves focus elsewhere on the page. The
 * registry item itself is a hard-coded expense demo that pulls in
 * `react-icons`, so the interaction is rebuilt here on `motion` (already a
 * dependency) and the existing admin endpoints.
 *
 * Every prop is plain data (`InlineRequest`, `InlineField[]`), so a server
 * page renders these directly: no wrapper component, no request callbacks.
 * Each control builds its own `csrfFetch`. Writes are optimistic with a
 * rollback, and a refusal from the server is shown verbatim (the API's
 * `error` string), not as a generic "failed".
 */

/** Sends one admin write and returns the server's own error text on failure. */
export async function sendInline(
  req: InlineRequest,
  body: Record<string, unknown> | undefined = req.body,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await csrfFetch(req.url, {
      method: req.method ?? "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: data?.error || `Not saved (HTTP ${res.status})` };
    // Some bulk endpoints answer 200 with a partial-success `error`.
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true };
  } catch {
    return { ok: false, error: "Not saved: the network request failed." };
  }
}

function ErrorText({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="block max-w-56 whitespace-normal text-xs font-medium text-danger">
      {message}
    </span>
  );
}

/* ── Select ─────────────────────────────────────────────────────────── */

/**
 * `<InlineSelect request={{ url, method: "PUT", valueKey: "approvalStatus" }} … />`
 * sends `{ ...request.body, approvalStatus: <picked> }`.
 */
export function InlineSelect({
  label,
  value,
  options,
  request,
  refresh = false,
  className,
}: {
  /** Accessible name (the column header is not attached to the control). */
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  request: InlineRequest;
  /** Re-run the server component after a save (when other cells derive from it). */
  refresh?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const errorId = useId();
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new server render (filters, pagination) brings a new value.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setCurrent(value);
  }

  async function change(next: string) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError(null);
    const result = await sendInline(request, bodyForValue(request, next));
    setSaving(false);
    if (!result.ok) {
      setCurrent(previous);
      setError(result.error);
      return;
    }
    if (refresh) router.refresh();
  }

  return (
    <span className={cn("inline-flex flex-col gap-1", className)}>
      <span className="relative inline-flex items-center">
        <select
          aria-label={label}
          aria-describedby={error ? errorId : undefined}
          aria-busy={saving}
          value={current}
          disabled={saving}
          onChange={(e) => change(e.target.value)}
          className="h-9 min-w-28 rounded-apple-sm border border-ink-200 bg-white pl-2.5 pr-8 text-sm font-medium text-ink-800 hover:border-ink-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 disabled:opacity-60 max-lg:h-11"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {saving ? <Loader2 className="pointer-events-none absolute right-7 size-3.5 animate-spin text-text-subtle" aria-hidden /> : null}
      </span>
      <ErrorText id={errorId} message={error} />
    </span>
  );
}

/* ── Toggle ─────────────────────────────────────────────────────────── */

/**
 * A two-state switch shown as the current state plus the action that flips
 * it ("Live · Hide"). Reading the state and acting on it are one control, so
 * a row never needs a separate status column and button.
 *
 * Either one `request` (the new boolean goes under its `valueKey`), or
 * `onRequest` / `offRequest` sent as-is, for endpoints that differ per
 * direction (`/activate` vs `/deactivate`, `visibility: "live" | "hidden"`).
 */
export function InlineToggle({
  on,
  onLabel,
  offLabel,
  turnOnLabel,
  turnOffLabel,
  request,
  onRequest,
  offRequest,
  confirmOff,
  refresh = false,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  /** Verb shown when off, e.g. "Activate". */
  turnOnLabel: string;
  /** Verb shown when on, e.g. "Deactivate". */
  turnOffLabel: string;
  request?: InlineRequest;
  onRequest?: InlineRequest;
  offRequest?: InlineRequest;
  /** Ask before switching off (destructive direction). */
  confirmOff?: string;
  refresh?: boolean;
}) {
  const router = useRouter();
  const errorId = useId();
  const [state, setState] = useState(on);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(on);
  // The in-page confirm for the destructive direction (it was window.confirm,
  // which a browser driver auto-dismisses and which looks like a dead button; QA-145).
  const [asking, setAsking] = useState(false);
  if (seen !== on) {
    setSeen(on);
    setState(on);
  }

  async function flip(confirmed = false) {
    const next = !state;
    if (!next && confirmOff && !confirmed) {
      setAsking(true);
      return;
    }
    setAsking(false);
    const spec = next ? onRequest : offRequest;
    if (!spec && !request) {
      setError("No request configured for this control.");
      return;
    }
    setState(next);
    setSaving(true);
    setError(null);
    const result = spec ? await sendInline(spec) : await sendInline(request!, bodyForValue(request!, next));
    setSaving(false);
    if (!result.ok) {
      setState(!next);
      setError(result.error);
      return;
    }
    if (refresh) router.refresh();
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", state ? "text-brand-800" : "text-ink-600")}>
          <span aria-hidden className={cn("size-1.5 rounded-full", state ? "bg-brand-600" : "bg-ink-300")} />
          {state ? onLabel : offLabel}
        </span>
        {asking ? (
          <span role="group" aria-label={confirmOff} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => void flip(true)}
              autoFocus
              className={cn(buttonClass({ variant: "ghost", size: "sm" }), "h-8 px-2 text-danger hover:bg-danger-soft max-lg:h-11")}
            >
              Yes, {turnOffLabel.toLowerCase()}
            </button>
            <button type="button" onClick={() => setAsking(false)} className={cn(buttonClass({ variant: "ghost", size: "sm" }), "h-8 px-2 max-lg:h-11")}>
              Cancel
            </button>
          </span>
        ) : (
        <button
          type="button"
          onClick={() => void flip()}
          disabled={saving}
          aria-describedby={error ? errorId : undefined}
          // Turning off (Deactivate, Hide) is the risky direction: quiet,
          // with a danger hover, never the brand-green of a safe action.
          className={cn(
            buttonClass({ variant: "ghost", size: "sm" }),
            "h-8 px-2 max-lg:h-11",
            state && "text-ink-600 hover:bg-danger-soft hover:text-danger",
          )}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {state ? turnOffLabel : turnOnLabel}
        </button>
        )}
      </span>
      {asking && confirmOff ? <span className="max-w-64 whitespace-normal text-xs text-ink-600">{confirmOff}</span> : null}
      <ErrorText id={errorId} message={error} />
    </span>
  );
}

/* ── Editor ─────────────────────────────────────────────────────────── */

/** Shared field style for inputs inside an inline form. */
export const inlineFieldClass =
  "h-9 w-full rounded-apple-sm border border-ink-200 bg-white px-2.5 text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 max-lg:h-11";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: InlineField;
  value: string;
  onChange: (next: string) => void;
}) {
  if (field.type === "choice") {
    return (
      <div role="radiogroup" aria-label={field.label} className="grid auto-cols-fr grid-flow-col gap-1.5">
        {(field.options ?? []).map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 rounded-apple-sm border px-2 text-sm font-semibold max-lg:h-11",
              value === o.value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        maxLength={field.maxLength}
        rows={3}
        className={cn(inlineFieldClass, "h-auto py-2")}
      />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      min={field.min}
      max={field.max}
      step={field.step}
      className={cn(inlineFieldClass, field.type === "number" && "nums")}
    />
  );
}

/**
 * A cell that shows a value and opens a small form in place: the pencil
 * reveals the fields, Done saves, Esc or Cancel closes. Only the edited cell
 * changes; the rest of the table keeps its focus and scroll.
 *
 * The form is declared as `fields`; the draft is reset from `value` each time
 * it opens, typed by `typedDraft` (numbers, empty → null, `onlyIfChanged`)
 * and sent as `{ ...request.body, ...values }` (or nested under `valueKey`).
 */
export function InlineEditor({
  label,
  value,
  fields,
  display,
  request,
  note,
  columns = 1,
  refresh = true,
  check,
}: {
  label: string;
  value: InlineValue;
  fields: readonly InlineField[];
  display: React.ReactNode;
  request: InlineRequest;
  /** One line under the fields, e.g. "Empty clears that rating." */
  note?: string;
  columns?: 1 | 2;
  refresh?: boolean;
  /** A rule checked before sending; a message stops the save and is shown. */
  check?: (values: Record<string, unknown>) => string | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<InlineDraft>(() => draftFrom(fields, value));
  const [draft, setDraft] = useState<InlineDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    formRef.current?.querySelector<HTMLElement>("input, select, textarea, [role=radio]")?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
    triggerRef.current?.focus();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const typed = typedDraft(fields, draft, initial);
    if (!typed.ok) {
      setError(typed.error);
      return;
    }
    const refused = check?.(typed.values);
    if (refused) {
      setError(refused);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await sendInline(request, bodyForDraft(request, typed.values));
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    triggerRef.current?.focus();
    if (refresh) router.refresh();
  }

  return (
    <div className="min-w-0">
      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            const start = draftFrom(fields, value);
            setInitial(start);
            setDraft(start);
            setOpen(true);
          }}
          aria-label={`Edit ${label}`}
          className="group inline-flex min-h-9 items-center gap-2 rounded-apple-sm px-1.5 text-left text-sm text-ink-800 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-brand-600 max-lg:min-h-11"
        >
          <span className="min-w-0">{display}</span>
          <Pencil className="size-3.5 shrink-0 text-text-subtle group-hover:text-brand-700" aria-hidden />
        </button>
      ) : null}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.form
            ref={formRef}
            key="editor"
            onSubmit={save}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
            aria-label={`Edit ${label}`}
            aria-describedby={error ? errorId : undefined}
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex min-w-56 flex-col gap-2 rounded-apple-md border border-brand-200 bg-white p-2.5 shadow-sm"
          >
            <div className={cn("grid gap-2", columns === 2 && "grid-cols-2")}>
              {fields.map((field) => (
                <label key={field.key} className="grid gap-1 text-xs font-medium text-ink-700">
                  {field.label}
                  <FieldInput field={field} value={draft[field.key] ?? ""} onChange={(next) => setDraft({ ...draft, [field.key]: next })} />
                  {field.hint ? <span className="font-normal text-ink-600">{field.hint}</span> : null}
                </label>
              ))}
            </div>
            {note ? <p className="text-xs text-ink-600">{note}</p> : null}
            <ErrorText id={errorId} message={error} />
            <div className="flex items-center gap-1.5">
              <button type="submit" disabled={saving} className={buttonClass({ variant: "primary", size: "sm" })}>
                {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                Done
              </button>
              <button type="button" onClick={close} className={buttonClass({ variant: "ghost", size: "sm" })}>
                <X className="size-3.5" aria-hidden />
                Cancel
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
