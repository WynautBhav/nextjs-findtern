import { Suspense } from "react";

import { SectionSkeleton } from "@/components/admin/reports/skeletons";

import type { TabProps } from "../types";
import Education from "./education";
import Geography from "./geography";
import Skills from "./skills";
import Summary from "./summary";
import InternTable from "./table";

/** Interns tab. Each section runs its own few queries behind its own Suspense boundary. */
export default function InternsTab(props: TabProps) {
  return (
    <>
      <Suspense fallback={<SectionSkeleton label="Loading intern figures" strip />}>
        <Summary {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading cities" />}>
        <Geography {...props} />
      </Suspense>
      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
        <Suspense fallback={<SectionSkeleton label="Loading education" />}>
          <Education />
        </Suspense>
        <Suspense fallback={<SectionSkeleton label="Loading skills" />}>
          <Skills />
        </Suspense>
      </div>
      <Suspense fallback={<SectionSkeleton label="Loading interns" height="h-96" />}>
        <InternTable {...props} />
      </Suspense>
    </>
  );
}
