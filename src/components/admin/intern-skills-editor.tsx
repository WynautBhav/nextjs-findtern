"use client";

import { buttonClass } from "@/components/ui/button";
/**
 * Edit the skills an admin can vouch for.
 *
 * The legacy admin edited skills from the intern's 360 page, and employers
 * filter and sort candidates on skills, so an admin-curated list is the input
 * that actually decides who gets shortlisted. This build has
 * `PUT /api/admin/interns/:id/skills` and nothing that calls it.
 *
 * Four to seven, matching the legacy rule: a longer list stops being a signal,
 * and employers read the top of it.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

const MIN = 4;
const MAX = 7;
const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
type Level = (typeof LEVELS)[number];
type Skill = { name: string; rating: Level };

export function InternSkillsEditor({
  internId,
  skills,
}: {
  internId: string;
  skills: Skill[];
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [list, setList] = useState<Skill[]>(skills);
  const dirty = JSON.stringify(list) !== JSON.stringify(skills);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function add() {
    const skill = value.trim();
    if (!skill) return;
    if (list.length >= MAX) {
      setError(`At most ${MAX} skills.`);
      return;
    }
    if (list.some((s) => s.name.toLowerCase() === skill.toLowerCase())) {
      setError("Already on the list.");
      return;
    }
    setList([...list, { name: skill, rating: "Beginner" }]);
    setValue("");
    setError(null);
    setSaved(false);
  }

  async function save() {
    if (list.length < MIN) {
      setError(`At least ${MIN} skills, or remove this editor.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch(`/api/admin/interns/${encodeURIComponent(internId)}/skills`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: list }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the skills.");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the skills.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-ink-700">
        Vouched skills ({list.length}/{MAX})
      </p>

      {list.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {list.map((skill) => (
            <li
              key={skill.name}
              // On touch each skill is its own row, so the level and remove
              // controls can be 44px without turning the pills into slabs (QA-104).
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 py-1 pl-3 pr-2 text-sm font-medium text-ink-800 touch:flex touch:w-full touch:rounded-apple-md touch:py-1.5"
            >
              {skill.name}
              <select
                value={skill.rating}
                onChange={(e) => {
                  setList(list.map((s) => (s.name === skill.name ? { ...s, rating: e.target.value as Level } : s)));
                  setSaved(false);
                }}
                aria-label={`Level for ${skill.name}`}
                className="rounded-apple-sm border border-ink-200 bg-white px-1.5 py-0.5 text-xs text-ink-700 touch:ml-auto touch:min-h-11 touch:px-2.5 touch:text-sm"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setList(list.filter((s) => s.name !== skill.name));
                  setSaved(false);
                }}
                aria-label={`Remove ${skill.name}`}
                className="grid size-6 place-items-center rounded-full text-ink-600 transition-colors hover:bg-danger-soft hover:text-danger touch:size-11"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-600">
          None recorded. Employers filtering on skills will not find this candidate.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a skill"
          className="h-11 min-w-0 flex-1 rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600/20"
        />
        <button
          type="button"
          onClick={add}
          className={buttonClass({ variant: "outline", size: "sm" })}
        >
          Add
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className={buttonClass({ variant: "primary", size: "sm" })}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Save
        </button>
      </div>

      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      {saved ? <p role="status" className="mt-2 text-sm text-brand-700">Skills saved.</p> : null}
    </div>
  );
}