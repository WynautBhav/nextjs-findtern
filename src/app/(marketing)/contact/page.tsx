import type { Metadata } from "next";
import { Clock, Mail, MapPin } from "lucide-react";

import { PageHero, PageSection } from "@/components/marketing/page-hero";
import { ContactForm } from "@/components/marketing/contact-form";
import { SITE, getGmailComposeUrl } from "@/lib/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Ask Findtern anything - hiring, interning, or a question about the rate card. Every message is read by a person.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Ask us <span className="text-primary">anything</span>.
          </>
        }
        lead="Hiring, interning, or a question about how the rate card works - all three reach the same inbox and all three get a human answer."
      />

      <PageSection>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          {/* ── Details ─────────────────────────────────────────── */}
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">
              Get in touch
            </h2>

            <ul className="mt-8 space-y-6">
              <Detail
                Icon={Mail}
                label="Email"
                value={SITE.email}
                href={getGmailComposeUrl()}
              />
              <Detail Icon={MapPin} label="Based in" value={SITE.address} />
              <Detail
                Icon={Clock}
                label="Hours"
                value="Mon–Fri 9:00–19:00 IST. Weekends closed."
              />
            </ul>

            <div className="mt-10 overflow-hidden rounded-2xl border border-ink-200">
              <iframe
                title="Findtern on the map"
                src="https://www.google.com/maps?q=Jaipur,+Rajasthan,+India&output=embed"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-64 w-full border-0"
              />
            </div>
          </div>

          {/* ── Form ────────────────────────────────────────────── */}
          <ContactForm />
        </div>
      </PageSection>
    </>
  );
}

function Detail({
  Icon,
  label,
  value,
  href,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-primary">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-500">
          {label}
        </p>
        {href ? (
          <a
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="mt-0.5 inline-flex items-center py-1 text-base text-ink-800 underline underline-offset-4 transition-colors hover:text-primary"
          >
            {value}
          </a>
        ) : (
          <p className="mt-1 text-base text-ink-800">{value}</p>
        )}
      </div>
    </li>
  );
}
