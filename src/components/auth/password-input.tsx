"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide button (bug sheet 30 Oct: "create account: add
 * an option to view password"). The sign-in form has had one; sign-up and reset now
 * share this one. The button is anchored to the bottom of the box so a margin the
 * caller puts on the input cannot push it off the field.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={cn(className, "pr-11")} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute bottom-0 right-0 grid size-11 place-items-center rounded-md text-text-subtle transition-colors [@media(any-hover:hover)]:hover:text-ink-800"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
