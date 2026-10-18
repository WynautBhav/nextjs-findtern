"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { DAY_STATUSES, type DayEntry } from "@/lib/employer-timesheets";

/** Day-by-day statuses; editable while the timesheet is awaiting a decision. */
export function TimesheetDayEditor({ timesheetId, entries, editable }: { timesheetId: string; entries: DayEntry[]; editable: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState(() => Object.fromEntries(entries.map((e) => [e.date, e.status])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const changed = entries.filter((e) => values[e.date] && values[e.date] !== e.status);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await csrfFetch(`/api/timesheets/${timesheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: changed.map((e) => ({ date: e.date, status: values[e.date] })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(res.ok ? "Changes saved. The intern has been told." : (data.error ?? "Couldn't save."));
      if (res.ok) router.refresh();
    } catch {
      setMessage("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-b border-ink-100 pb-2 pr-4 text-xs font-medium text-text-subtle">Date</th>
              <th scope="col" className="border-b border-ink-100 pb-2 text-xs font-medium text-text-subtle">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.date}>
                <td className="border-b border-ink-100 py-2 pr-4 tabular-nums text-ink-700">
                  {new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                </td>
                <td className="border-b border-ink-100 py-1.5">
                  {editable ? (
                    <select
                      aria-label={`Status for ${entry.date}`}
                      value={values[entry.date] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [entry.date]: e.target.value }))}
                      className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-800"
                    >
                      {!values[entry.date] ? <option value="">Not claimed</option> : null}
                      {DAY_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-ink-700">{entry.status || "Not claimed"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={busy || changed.length === 0}
            onClick={save}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
          >
            {busy ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "No changes"}
          </button>
          {message ? <span role="status" className="text-xs text-text-subtle">{message}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
