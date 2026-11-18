import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Check, Receipt } from "lucide-react";

import { LoadError } from "@/components/app/load-error";
import { Pill } from "@/components/app/primitives";
import { RollingNumber } from "@/components/app/rolling-number";
import { Section } from "@/components/app/stat";
import { SubscriptionBuy } from "@/components/employer/subscription/subscription-buy";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth";
import { SITE } from "@/lib/content/site";
import { getDb, schema } from "@/lib/db";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { employerSubscription } from "@/lib/subscription/entitlement-db";
import { formatDate, formatMoney } from "@/lib/format";
import { getEmployerSubscriptionConfig } from "@/lib/platform-settings";
import { subscriptionCurrency, subscriptionListMinor } from "@/lib/subscription/order";
import { buyLabel, renewalNote, statusLine, statusView, UNLOCKS } from "@/lib/subscription/view";

export const metadata: Metadata = {
  title: "Findtern Pro",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const UNLOCK_COPY: Record<(typeof UNLOCKS)[number], string> = {
  "CGPA filter": "Narrow the candidate list to a verified CGPA range.",
  "College filter and sort": "Filter candidates by college, and sort the list by it.",
};

/**
 * Findtern Pro: the employer subscription. The plan and what it unlocks, where this company stands (status, end date in India
 * time), and a buy or renew form. Everything here is read on the server; the form only sends a promo code.
 */
export default async function EmployerSubscriptionPage() {
  const session = await requireRole("employer");
  const employerId = session.uid;
  await requireEmployerSetup(employerId);

  let employer: { companyName: string; companyEmail: string; country: string | null; countryCode: string | null; phoneNumber: string | null } | undefined;
  try {
    [employer] = await getDb()
      .select({ companyName: schema.employers.companyName, companyEmail: schema.employers.companyEmail, country: schema.employers.country, countryCode: schema.employers.countryCode, phoneNumber: schema.employers.phoneNumber })
      .from(schema.employers)
      .where(eq(schema.employers.id, employerId))
      .limit(1);
  } catch (err) {
    console.error("Failed to load the subscription page:", err);
  }
  if (!employer) {
    return (
      <div>
        <PageHeader title="Findtern Pro" />
        <LoadError what="your subscription" retryHref="/employer/subscription" email={SITE.adminEmail} />
      </div>
    );
  }

  const [config, state] = await Promise.all([getEmployerSubscriptionConfig(), employerSubscription(employerId)]);
  const currency = subscriptionCurrency(employer);
  const listMinor = subscriptionListMinor(config, currency);
  const view = statusView(state);

  const wholeRupees = currency === "INR" && listMinor % 100 === 0;

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader title="Findtern Pro" subtitle="Filter candidates by CGPA and by college." />

      <div className="grid gap-x-14 gap-y-10 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <section className="min-w-0" aria-labelledby="plan-title">
          {/* The price is the page's one figure: a year of two filters, said as a number. */}
          <h2 id="plan-title" className="text-sm font-medium text-ink-600">
            The plan
          </h2>
          <p className="nums mt-1 font-display text-5xl font-semibold leading-none tracking-[-0.03em] text-ink-900">
            {wholeRupees ? <RollingNumber value={listMinor / 100} currency="INR" /> : formatMoney(listMinor, currency)}
          </p>
          <p className="mt-3 text-base text-ink-700">
            {currency === "INR" ? "GST included" : "All taxes included"} · {config.durationDays} days of access
          </p>

          <Section title="What it unlocks on Candidates" className="mt-10">
            <ul className="divide-y divide-ink-200 border-b border-ink-200">
              {UNLOCKS.map((u) => (
                <li key={u} className="flex items-start gap-3 py-3.5">
                  <Check className="mt-1 size-4 shrink-0 text-brand-700" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-ink-900">{u}</span>
                    <span className="block text-sm text-ink-700">{UNLOCK_COPY[u]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <div id="buy" className="mt-10 max-w-xl scroll-mt-24">
            <Section title={config.enabled ? buyLabel(state) : "Not on sale"}>
              {config.enabled ? (
                <SubscriptionBuy
                  employerId={employerId}
                  currency={currency}
                  listMinor={listMinor}
                  durationDays={config.durationDays}
                  renewing={state.active}
                  note={renewalNote(state, config.durationDays)}
                  prefill={{ name: employer.companyName, email: employer.companyEmail, contact: employer.phoneNumber ? `${employer.countryCode ?? ""}${employer.phoneNumber}` : undefined }}
                />
              ) : (
                <div role="status" className="text-sm leading-relaxed text-ink-700">
                  <p className="font-medium text-ink-900">Findtern Pro is not on sale right now.</p>
                  <p className="mt-1">There is nothing to buy at the moment. Write to {SITE.adminEmail} if you would like it switched on for your company.</p>
                </div>
              )}
            </Section>
          </div>
        </section>

        <aside className="min-w-0 max-xl:order-first xl:sticky xl:top-24 xl:self-start" aria-label="Your subscription">
          <Section title="Your subscription">
            <p className="flex flex-wrap items-center gap-2">
              <Pill tone={view.tone} size="md" icon={<span aria-hidden className="size-1.5 rounded-full bg-current" />}>
                {view.label}
              </Pill>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-800">{statusLine(state)}</p>
            {state.endsAt ? (
              <dl className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-sm text-ink-700">{state.active ? "Access until (India time)" : "Ended on (India time)"}</dt>
                  <dd className="nums font-display text-lg font-semibold text-ink-900">{formatDate(state.endsAt)}</dd>
                </div>
                {state.active && state.daysLeft !== null ? (
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-sm text-ink-700">Days left</dt>
                    <dd className="nums font-display text-lg font-semibold text-ink-900">{state.daysLeft}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 text-sm">
              {config.enabled ? (
                <a href="#buy" className="inline-flex min-h-11 items-center font-medium text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 xl:hidden">
                  {buyLabel(state)}
                </a>
              ) : null}
              <Link href="/employer/orders" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
                <Receipt className="size-4" aria-hidden />
                Invoices under Orders
              </Link>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
