"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * A labelled field: label above, hint beneath the label, error beneath the control. It hands the
 * control the props that wire them together, so every form in the product reads the same:
 *
 *   <Field label="Company name" hint="As on your invoice" error={errors.name}>
 *     {(p) => <Input {...p} defaultValue={name} />}
 *   </Field>
 */
export type FieldControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true; required?: boolean };

export function Field({
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** Say "optional" instead of marking required fields. */
  optional?: boolean;
  className?: string;
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-ink-600">(optional)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-sm text-ink-600">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">{children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}</div>
      {error ? (
        <p id={errId} role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
