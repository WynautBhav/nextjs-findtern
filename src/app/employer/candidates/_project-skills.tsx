"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { csrfFetch } from "@/lib/client-fetch";
import { DISTRICTS } from "@/lib/data/districts";
import { projectCityPlan, projectSkillPlan } from "@/lib/project-skill-sync";

type Save = (current: string[], next: string[]) => Promise<boolean>;
type ProjectSkills = { save: Save; notice: string; saveCity: (city: string) => void; cityNotice: string };

const ProjectSkillsContext = createContext<ProjectSkills | null>(null);

/**
 * The Candidates region with a project selected: a skill change saves to that project before it filters
 * (lib/project-skill-sync has the rule). Outside it (the Compare page) skills only filter.
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
  // One save at a time, held until the reloaded list arrives: a second change built from the old list would overwrite the first.
  const busy = useRef(false);
  const waitingFor = useRef<string | null>(null);
  const savedKey = saved.join("|");
  // The project's list reloaded: the next change starts from it.
  useEffect(() => {
    waitingFor.current = null;
  }, [savedKey]);
  const save = useCallback<Save>(
    async (current, next) => {
      if (!projectId) return true;
      if (busy.current || waitingFor.current !== null) return false;
      const plan = projectSkillPlan(saved, current, next);
      if (plan.action === "block") {
        setNotice(plan.message);
        return false;
      }
      if (plan.action === "filter") {
        setNotice(plan.message);
        return true;
      }
      busy.current = true;
      try {
        const res = await csrfFetch(`/api/employer/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skills: next }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // Not saved (a project in review, a skill outside the list): the list still filters, and says why.
        // The server may respell a skill; give up waiting after a few seconds rather than lock the chips.
        if (res.ok) {
          const key = next.join("|");
          waitingFor.current = key;
          window.setTimeout(() => {
            if (waitingFor.current === key) waitingFor.current = null;
          }, 4000);
        }
        setNotice(res.ok ? "" : `Not saved to the project: ${body.error ?? "try again."}`);
      } catch {
        setNotice("Not saved to the project: check your connection and try again.");
      } finally {
        busy.current = false;
      }
      return true;
    },
    [projectId, saved],
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
  const value = useMemo(() => ({ save, notice, saveCity, cityNotice }), [save, notice, saveCity, cityNotice]);
  return <ProjectSkillsContext.Provider value={value}>{children}</ProjectSkillsContext.Provider>;
}

const filterOnly: ProjectSkills = { save: async () => true, notice: "", saveCity: () => {}, cityNotice: "" };

export function useProjectSkills(): ProjectSkills {
  return useContext(ProjectSkillsContext) ?? filterOnly;
}
