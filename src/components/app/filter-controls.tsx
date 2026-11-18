import { fieldClass } from "@/components/employer/ui-tokens";
import { cn } from "@/lib/utils";

/**
 * Filter-bar rules for the employer, college and intern consoles (the admin console has its own in
 * components/admin/filter-controls.tsx): every search box, select and date input in a bar is
 * `fieldClass` (44 px, one border, one radius, one focus ring), so no bar mixes shapes. A page never
 * hand-rolls a one-off radius on a filter control (a source-scan test enforces this).
 */
export const APP_FILTER_CONTROL = fieldClass;

/** A select in a bar: the control, not stretched by `w-full`. */
export const APP_FILTER_SELECT = cn(fieldClass, "w-auto min-w-0");

/** One wrapping row; `items-end` plus one control height gives every box one top and one baseline. */
export const APP_FILTER_BAR = "flex flex-wrap items-end gap-x-2.5 gap-y-3";
