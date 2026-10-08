/* eslint-disable @next/next/no-img-element -- already-optimised WebP served
   from /public. next/image would re-encode per requested width for no gain
   on files that are already 8-30 KB, and would drop the intrinsic sizing
   these fixed-height logo rows rely on. */
import Image from "next/image";
import {
  BadgeCheck,
  Briefcase,
  ChartLine,
  CircleDot,
  Code2,
  Globe,
  HeartPulse,
  Megaphone,
  Monitor,
  PenTool,
  Star,
  Users,
  Wallet,
} from "lucide-react";

import { SectionHeading } from "@/components/ui/section-heading";
import { TiltCard } from "@/components/motion/tilt-card";
import { VelocityMarquee } from "@/components/motion/velocity-marquee";
import { TestimonialCarousel } from "@/components/marketing/testimonial-carousel";
import type {
  CmsPartner,
  CmsFeaturedSkill,
  CmsHappyFace,
} from "@/lib/content/types";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Partner marquee
   ========================================================================== */

export function PartnersMarquee({ partners }: { partners: CmsPartner[] }) {
  if (!partners.length) return null;

  return (
    <section className="section-y-tight border-y border-ink-100 bg-ink-50/70">
      <div className="container-page">
        <p className="text-center text-2xs font-semibold uppercase tracking-[0.18em] text-text-subtle">
          Working with teams at{" "}
          <span className="text-primary">leading organisations</span>
        </p>
      </div>

      <VelocityMarquee duration={38} className="mt-8">
        {partners.map((p) => (
          <PartnerCard key={p.id} partner={p} />
        ))}
      </VelocityMarquee>
    </section>
  );
}

/**
 * Partner logo.
 *
 * No card chrome. The uploaded assets are inconsistent — Stagelife's is a
 * solid black rectangle, the rest are transparent PNGs — and putting each one
 * in its own white bordered box made that inconsistency read as a set of
 * mismatched tiles. Dropping the chrome and fixing a single height lets them
 * sit as a logo wall, which is what this is, and the odd asset stops looking
 * like a bug.
 *
 * The assets themselves are the partners' brand marks and are rendered
 * as supplied. Ask Findtern to re-upload the ones with baked-in backgrounds
 * on transparency.
 */
function PartnerCard({ partner }: { partner: CmsPartner }) {
  const inner = (
    <div className="flex h-14 w-40 items-center justify-center px-2 transition-opacity duration-300 group-hover/logo:opacity-100 sm:w-44">
      <img
        src={partner.logoUrl}
        alt={partner.name}
        width={176}
        height={56}
        loading="lazy"
        decoding="async"
        className="max-h-11 w-auto max-w-full object-contain opacity-80"
      />
    </div>
  );

  const cls = "group/logo shrink-0";

  return partner.href ? (
    <a
      href={partner.href}
      target="_blank"
      rel="noreferrer noopener"
      className={cls}
    >
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ==========================================================================
   Featured skills
   ========================================================================== */

const SKILL_ICONS: Record<string, typeof PenTool> = {
  "fa-pen-nib": PenTool,
  "fa-chart-line": ChartLine,
  "fa-bullhorn": Megaphone,
  "fa-wallet": Wallet,
  "fa-desktop": Monitor,
  "fa-code": Code2,
  "fa-briefcase": Briefcase,
  "fa-users": Users,
  "fa-star": Star,
  "fa-globe": Globe,
  "fa-heart-pulse": HeartPulse,
  "fa-circle": CircleDot,
  design: PenTool,
  sales: ChartLine,
  marketing: Megaphone,
  finance: Wallet,
  technology: Monitor,
  engineering: Code2,
  business: Briefcase,
  hr: Users,
  "social-media-content": Megaphone,
  operations: Briefcase,
  healthcare: HeartPulse,
};

/**
 * Featured skills.
 *
 * The loop renders two identical halves, so the second one is marked
 * `aria-hidden` by VelocityMarquee. That stops a screen reader announcing
 * every category twice, but it did not stop the DOM: eleven extra <h3>s sat
 * in the document outline, and search engines index headings independently of
 * aria-hidden. The duplicate is therefore rendered with the visual styling but
 * as a <p>, so it contributes nothing to the outline. Eleven real headings,
 * eleven silent twins.
 */
export function SkillsMarquee({ skills }: { skills: CmsFeaturedSkill[] }) {
  if (!skills.length) return null;

  return (
    <section className="section-y">
      <div className="container-page">
        <SectionHeading
          lead="Featured"
          accent="Skills"
          sub="Every category carries a resource library, so you can prepare before you apply."
        />
      </div>

      <VelocityMarquee
        duration={30}
        reverse
        className="mt-12"
        loopCopy={skills.map((s) => (
          <SkillCard key={s.id} skill={s} isLoopCopy />
        ))}
      >
        {skills.map((s) => (
          <SkillCard key={s.id} skill={s} />
        ))}
      </VelocityMarquee>
    </section>
  );
}

function SkillCard({ skill, isLoopCopy = false }: { skill: CmsFeaturedSkill; isLoopCopy?: boolean }) {
  const Icon = SKILL_ICONS[skill.iconClass] ?? CircleDot;
  const Heading = isLoopCopy ? "p" : "h3";

  return (
    <TiltCard max={7} className="w-56 shrink-0">
      <div className="group/skill flex h-full flex-col gap-3.5 rounded-2xl border border-ink-200 bg-white p-5 transition-colors duration-200 ease-ease-out hover:border-brand-300">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-primary transition-colors duration-200 ease-ease-out group-hover/skill:from-primary group-hover/skill:to-brand-800 group-hover/skill:text-white">
          <Icon className="size-5" aria-hidden />
        </span>

        <Heading
          className={cn(
            "text-base font-semibold leading-snug text-ink-900",
            !isLoopCopy && "tracking-tight",
          )}
        >
          {skill.title}
        </Heading>
        {skill.metaText ? (
          <p className="mt-1 text-xs text-text-subtle">{skill.metaText}</p>
        ) : null}

        {/* resourceCount of 0 is real data and renders as such. */}
        <p className="mt-auto flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.1em] text-text-subtle">
          <BadgeCheck
            className={cn(
              "size-3.5",
              skill.resourceCount > 0 ? "text-primary" : "text-ink-400",
            )}
            aria-hidden
          />
          {skill.resourceCount}{" "}
          {skill.resourceCount === 1 ? "Resource" : "Resources"}
        </p>
      </div>
    </TiltCard>
  );
}

/* ==========================================================================
   Happy Faces
   ========================================================================== */

export function HappyFaces({ faces }: { faces: CmsHappyFace[] }) {
  if (!faces.length) return null;

  return (
    <section className="section-y bg-ink-50/60">
      <div className="container-page">
        <SectionHeading
          lead="Happy"
          accent="Faces"
          sub="Interns and employers on what actually happened."
        />
        <div className="mt-12">
          <TestimonialCarousel
            testimonials={faces.map((f) => ({
              id: f.id,
              name: f.name,
              role: f.company ? `${f.title} · ${f.company}` : f.title,
              quote: f.quote,
              avatarUrl: f.avatarUrl,
            }))}
          />
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   About — exported from here so the collage can reuse the masking helper
   ========================================================================== */

export function CirclePhoto({
  src,
  alt,
  className,
  sizes = "(max-width: 1024px) 45vw, 22vw",
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full border-4 border-white bg-ink-100 shadow-xl",
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
