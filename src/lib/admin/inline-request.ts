/**
 * Serialisable request specs for the admin inline controls
 * (`components/admin/inline-control.tsx`).
 *
 * A server page renders the controls directly, so everything they need to
 * build a write has to be plain data: no request-builder callbacks (a
 * function cannot cross from a server component into a client one). The
 * control fills in the edited value; these helpers say exactly how.
 */

export type InlineMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type InlineRequest = {
  url: string;
  method?: InlineMethod;
  /** Fixed body fields, e.g. `{ ids: [id] }` or `{ type, id }`. */
  body?: Record<string, unknown>;
  /**
   * Body key that receives the edited value. Select: the picked option.
   * Toggle: the new boolean. Editor: the whole draft object (omit it to
   * spread the draft's fields into the body instead).
   */
  valueKey?: string;
};

/** One field of an `InlineEditor` form. */
export type InlineField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "choice";
  /** `choice`: rendered as a segmented radio group. */
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  /** Leave the field out of the request unless the admin changed it. */
  onlyIfChanged?: boolean;
};

export type InlineDraft = Record<string, string>;
export type InlineValue = Record<string, string | number | null | undefined>;

/** Body for a single value (select option or toggle state). */
export function bodyForValue(req: InlineRequest, value: unknown): Record<string, unknown> {
  return { ...(req.body ?? {}), [req.valueKey ?? "value"]: value };
}

/** The editor's starting draft: every field as a string, missing as "". */
export function draftFrom(fields: readonly InlineField[], value: InlineValue): InlineDraft {
  return Object.fromEntries(
    fields.map((f) => {
      const v = value[f.key];
      return [f.key, v === null || v === undefined ? "" : String(v)];
    }),
  );
}

/**
 * Converts a draft to typed values: numbers become numbers (empty → null,
 * so "clear this rating" is expressible), text is trimmed (empty → null),
 * and `onlyIfChanged` fields are dropped when untouched.
 *
 * Returns an error string instead when a number field is not a number or is
 * outside its min/max, so the form can say so before the round trip.
 */
export function typedDraft(
  fields: readonly InlineField[],
  draft: InlineDraft,
  initial: InlineDraft,
): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = (draft[f.key] ?? "").trim();
    if (f.onlyIfChanged && raw === (initial[f.key] ?? "").trim()) continue;
    if (f.type === "number") {
      if (raw === "") {
        values[f.key] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: `${f.label} must be a number.` };
      if (f.min !== undefined && n < f.min) return { ok: false, error: `${f.label} must be at least ${f.min}.` };
      if (f.max !== undefined && n > f.max) return { ok: false, error: `${f.label} must be at most ${f.max}.` };
      values[f.key] = n;
    } else {
      values[f.key] = raw === "" ? null : raw;
    }
  }
  return { ok: true, values };
}

/** Body for an editor save: the draft spread in, or nested under `valueKey`. */
export function bodyForDraft(req: InlineRequest, values: Record<string, unknown>): Record<string, unknown> {
  return req.valueKey ? { ...(req.body ?? {}), [req.valueKey]: values } : { ...(req.body ?? {}), ...values };
}
