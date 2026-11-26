"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { csrfFetch } from "@/lib/client-fetch";
import { DISTRICTS } from "@/lib/data/districts";
import { projectCityPlan } from "@/lib/project-skill-sync";

type ProjectSkills = {
  /** The selected project (null outside the Candidates page, or with project matching off): no save is offered. */
  projectId: string | null;
  /** The project's stored skills. */
  saved: string[];
  /** "Save to project": puts these skills on the project. True when saved. */
  saveSkills: (skills: string[]) => Promise<boolean>;
  saving: boolean;
  notice: string;
  saveCity: (city: string) => void;
  cityNotice: string;
};

const ProjectSkillsContext = createContext<ProjectSkills | null>(null);

/**
 * The Candidates region with a project selected. Skill chips only filter (bug sheet 25 Nov); "Save to project" puts the
 * chips on the project, at 4 to 7 skills (lib/project-skill-sync has the rule). Outside it (the Compare page) skills only filter.
 */
export function ProjectSkillsProvider({
  projectId,
  saved,
  place,
  children,
}: {
  projectId: string | null;
  /** The project's stored skills. */
  saved: string[];
  /** The project's work mode and state, for a city picked in the location filter. */
  place: { locationType: string | null; state: string | null } | null;
  children: React.ReactNode;
}) {
  const [notice, setNotice] = useState("");
  const [cityNotice, setCityNotice] = useState("");
  // A message about one project does not follow the employer to the next.
  const [noticeFor, setNoticeFor] = useState(projectId);
  if (noticeFor !== projectId) {
    setNoticeFor(projectId);
    setNotice("");
    setCityNotice("");
  }
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const saveSkills = useCallback(
    async (skills: string[]) => {
      if (!projectId || busy.current) return false;
      busy.current = true;
      setSaving(true);
      try {
        const res = await csrfFetch(`/api/employer/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skills }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // Not saved (a project in review, a skill outside the list): the chips still filter, and say why.
        setNotice(res.ok ? "Saved to the project." : `Not saved to the project: ${body.error ?? "try again."}`);
        // The project's stored list reloads, so the Save button goes away once it matches.
        if (res.ok) router.refresh();
        return res.ok;
      } catch {
        setNotice("Not saved to the project: check your connection and try again.");
        return false;
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    [projectId, router],
  );
  // The city filter applies on its own (a form submit); the project save runs beside it and only reports back.
  const saveCity = useCallback(
    (city: string) => {
      if (!projectId || !place) return;
      const plan = projectCityPlan(city, place, DISTRICTS);
      if (plan.action === "skip") {
        setCityNotice(plan.message);
        return;
      }
      setCityNotice("");
      csrfFetch(`/api/employer/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan.body),
      })
        .then(async (res) => {
          if (res.ok) return setCityNotice(plan.label ? `Saved to the project: ${plan.label}.` : "Preferred work location cleared on the project.");
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setCityNotice(`Not saved to the project: ${body.error ?? "try again."}`);
        })
        .catch(() => setCityNotice("Not saved to the project: check your connection and try again."));
    },
    [projectId, place],
  );
  const value = useMemo(() => ({ projectId, saved, saveSkills, saving, notice, saveCity, cityNotice }), [projectId, saved, saveSkills, saving, notice, saveCity, cityNotice]);
  return <ProjectSkillsContext.Provider value={value}>{children}</ProjectSkillsContext.Provider>;
}

const filterOnly: ProjectSkills = { projectId: null, saved: [], saveSkills: async () => false, saving: false, notice: "", saveCity: () => {}, cityNotice: "" };

export function useProjectSkills(): ProjectSkills {
  return useContext(ProjectSkillsContext) ?? filterOnly;
}
