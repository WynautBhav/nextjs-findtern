import { Suspense } from "react";

import { SectionSkeleton } from "@/components/admin/reports/skeletons";

import type { TabProps } from "../types";
import Companies from "./companies";
import Projects from "./projects";
import Skills from "./skills";
import Summary from "./summary";

/** Employers tab. Each section runs its own few queries behind its own Suspense boundary. */
export default function EmployersTab(props: TabProps) {
  return (
    <>
      <Suspense fallback={<SectionSkeleton label="Loading employer figures" strip />}>
        <Summary {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading projects" />}>
        <Projects {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading companies" height="h-96" />}>
        <Companies {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading skills in demand" />}>
        <Skills {...props} />
      </Suspense>
    </>
  );
}
