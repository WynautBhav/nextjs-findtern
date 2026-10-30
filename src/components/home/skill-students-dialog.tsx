"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ButtonLink } from "@/components/ui/button";
import type { CmsFeaturedSkill } from "@/lib/content/types";
import type { PublicStudent } from "@/app/api/marketing/students/route";

const NON_TECH_CATEGORIES = new Set([
  "human resource",
  "sales",
  "marketing",
  "finance",
  "business",
  "operations",
  "social media and content",
  "healthcare",
]);

export function SkillStudentsDialog({
  skill,
  isOpen,
  onClose,
}: {
  skill: CmsFeaturedSkill | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [students, setStudents] = useState<PublicStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSkillTitle, setActiveSkillTitle] = useState<string | null>(null);

  if (isOpen && skill && skill.title !== activeSkillTitle) {
    setActiveSkillTitle(skill.title);
    setLoading(true);
  }

  // Freeze background window scroll and pause Lenis smooth-scroll while dialog is open
  useEffect(() => {
    if (!isOpen) return;

    const win = window as unknown as { __lenis?: { stop: () => void; start: () => void } };
    win.__lenis?.stop();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      win.__lenis?.start();
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !skill) return;

    let cancelled = false;

    fetch(`/api/marketing/students?skill=${encodeURIComponent(skill.title)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.students) {
          setStudents(data.students);
        }
      })
      .catch(() => {
        // Fallback gracefully if request fails
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, skill]);

  if (!skill) return null;

  const categoryNorm = skill.title.toLowerCase();
  const isNonTech = NON_TECH_CATEGORIES.has(categoryNorm);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        data-lenis-prevent
        className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-ink-200 p-0 shadow-2xl sm:max-w-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6">
          <DialogHeader className="min-w-0 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">
              {skill.title}
              <span className="ml-2 text-sm font-normal text-ink-600 tabular-nums">
                {skill.resourceCount} candidates
              </span>
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-relaxed text-ink-600">
              Screened and scored. Names show as initials until you hire.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <ul aria-busy className="divide-y divide-ink-100">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-4 px-5 py-5 sm:px-6">
                  <span className="size-10 shrink-0 animate-pulse rounded-full bg-ink-100 motion-reduce:animate-none" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-3.5 w-1/3 animate-pulse rounded bg-ink-100 motion-reduce:animate-none" />
                    <span className="block h-3 w-2/3 animate-pulse rounded bg-ink-100 motion-reduce:animate-none" />
                  </span>
                </li>
              ))}
            </ul>
          ) : students.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm text-ink-600">
              No {skill.title.toLowerCase()} candidates to show right now.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {students.map((student) => {
                const ratings = (
                  !isNonTech && typeof student.ratings.coding === "number" && student.ratings.coding > 0
                    ? [
                        ["Coding", student.ratings.coding],
                        ["Aptitude", student.ratings.aptitude],
                        ["Interview", student.ratings.interview],
                      ]
                    : [
                        ["Communication", student.ratings.communication],
                        ["Aptitude", student.ratings.aptitude],
                        ["Interview", student.ratings.interview],
                      ]
                ).filter((r): r is [string, number] => typeof r[1] === "number" && r[1] > 0);

                return (
                  <li key={student.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 px-5 py-5 sm:px-6">
                    <span
                      aria-hidden
                      className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800"
                    >
                      {student.initials}
                    </span>

                    <div className="min-w-0">
                      <h4 className="text-[15px] font-semibold text-ink-900">{student.shortName}</h4>
                      <p className="mt-0.5 truncate text-[13px] text-ink-600">
                        {[student.college, student.degree, [student.city, student.state].filter(Boolean).join(", ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {student.skills.length ? (
                        <p className="mt-2.5 flex flex-wrap gap-1.5">
                          {student.skills.slice(0, 5).map((sk) => (
                            <span key={sk} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-700">
                              {sk}
                            </span>
                          ))}
                          {student.skills.length > 5 ? (
                            <span className="px-1 py-0.5 text-xs text-ink-600">+{student.skills.length - 5}</span>
                          ) : null}
                        </p>
                      ) : null}
                      {ratings.length ? (
                        <p className="mt-2 text-xs text-ink-600 tabular-nums">
                          {ratings.map(([label, value]) => `${label} ${value.toFixed(1)}`).join("  ·  ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-semibold leading-none tracking-tight text-ink-900 tabular-nums">
                        {student.score.toFixed(1)}
                        <span className="text-xs font-normal text-ink-600">/10</span>
                      </p>
                      <p className="mt-1.5 text-xs text-ink-600">{student.band}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[13px] text-ink-600">Full profiles open once you send a proposal.</p>
          <ButtonLink href="/signup?as=employer" variant="primary" size="sm" className="shrink-0">
            Start hiring
            <ArrowRight className="size-3.5" aria-hidden />
          </ButtonLink>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
