"use client";

import { useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { DetailRow } from "@/components/app/primitives";
import { StatusBadge } from "@/components/admin/status-badge";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { scopeLabel, type Project } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { statusMeta } from "@/app/employer/projects/status";
import { engagementOf } from "@/lib/admin/projects-board-pure";

/** Read-only view of every field of a project, for the admin's company projects tab. */
export function ProjectDetailsButton({ project: p }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const list = (v: string[] | null) => (v?.length ? v.join(", ") : "-");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: "outline", size: "sm", className: ADMIN_PILL_SECONDARY })}>
        View details
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{p.projectName}</DialogTitle>
            <DialogDescription>Everything the company entered for this project.</DialogDescription>
          </DialogHeader>
          <dl className="divide-y divide-ink-200">
            <DetailRow label="Status" value={<StatusBadge value={p.status} label={statusMeta(p.status || "published").label} />} />
            {p.takenDownAt ? <DetailRow label="Taken down" value={`${formatDate(p.takenDownAt)}${p.takenDownReason ? `: ${p.takenDownReason}` : ""}`} /> : null}
            {p.rejectionReason ? <DetailRow label="Rejection reason" value={p.rejectionReason} /> : null}
            <DetailRow label="Skills" value={list(p.skills)} />
            <DetailRow label="Work mode" value={<span className="capitalize">{p.locationType || "Remote"}</span>} />
            <DetailRow label="Onsite / preferred locations" value={list(p.preferredLocations)} />
            <DetailRow label="City, state, pincode" value={[p.city, p.state, p.pincode].filter(Boolean).join(", ") || "-"} />
            <DetailRow label="Timezone" value={p.timezone || "-"} />
            <DetailRow label="Duration" value={scopeLabel(p.scopeOfWork)} />
            <DetailRow label="Full-time after internship" value={engagementOf(p).ftAfterInternship} />
            <DetailRow label="Created" value={formatDate(p.createdAt)} />
            <DetailRow label="Submitted" value={p.submittedAt ? formatDate(p.submittedAt) : "-"} />
            <DetailRow label="Published" value={p.publishedAt ? formatDate(p.publishedAt) : "-"} />
            <DetailRow label="Last updated" value={formatDate(p.updatedAt)} />
          </dl>
          {p.description ? (
            <div>
              <h3 className="text-sm text-text-subtle">Description</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900 [overflow-wrap:anywhere]">{p.description}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
