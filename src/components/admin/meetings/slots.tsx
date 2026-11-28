import { Check } from "lucide-react";

import { notPickedText, slotList, slotText, zoneNote, type MeetingRow } from "@/lib/admin/meeting-stage";
import { cn } from "@/lib/utils";

/**
 * Every offered time (1 to 3), the picked one in an accent chip with a check and the word "Picked" (never colour alone),
 * the rest plain; "Not picked yet" while none is and the meeting is open ("Not picked" once closed). Times are IST; a meeting set in another zone gets one line saying so.
 * The table and the drawer both use this.
 */
export function Slots({ row, className, showZone = true }: { row: Pick<MeetingRow, "slots" | "startsAt" | "timezone" | "stage">; className?: string; showZone?: boolean }) {
  const list = slotList(row);
  const zone = showZone ? zoneNote(row) : null;
  if (!list.length) return <span className="text-text-subtle">No time offered</span>;
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <ul className="space-y-1">
        {list.map((s) => (
          <li key={s.at} className="nums whitespace-nowrap">
            {s.picked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 font-medium text-accent-700">
                <Check className="size-3.5 shrink-0" aria-hidden />
                {slotText(s.at)}
                <span className="sr-only">, picked</span>
              </span>
            ) : (
              <span className="px-2 text-text-subtle">{slotText(s.at)}</span>
            )}
          </li>
        ))}
      </ul>
      {row.startsAt ? null : <p className="px-2 text-[0.8125rem] text-text-subtle">{notPickedText(row)}</p>}
      {zone ? <p className="px-2 text-[0.8125rem] text-text-subtle">{zone}</p> : null}
    </div>
  );
}
