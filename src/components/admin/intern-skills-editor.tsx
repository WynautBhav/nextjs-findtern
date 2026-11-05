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
import { Loader2 } from "lucide-react";

import { SkillPicker } from "@/components/skills/skill-picker";
import { csrfFetch } from "@/lib/client-fetch";
import { MIN_SKILLS } from "@/lib/onboarding";

export function InternSkillsEditor({
  internId,
  skills,
}: {
  internId: string;
  skills: string[];
}) {
  const router = useRouter();
  const [list, setList] = useState<string[]>(skills);
  const dirty = JSON.stringify(list) !== JSON.stringify(skills);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (list.length < MIN_SKILLS) {
      setError(`At least ${MIN_SKILLS} skills, or remove this editor.`);
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
      {list.length === 0 ? (
        <p className="mb-2 text-sm text-ink-600">
          None recorded. Employers filtering on skills will not find this candidate.
        </p>
      ) : null}
      <SkillPicker
        id="admin-skills"
        label="Vouched skills"
        value={list}
        onChange={(n) => {
          setList(n);
          setSaved(false);
          setError(null);
        }}
      />
      <div className="mt-3">
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