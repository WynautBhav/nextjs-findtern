import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Check, Receipt } from "lucide-react";

import { LoadError } from "@/components/app/load-error";
import { DetailRow, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { SubscriptionBuy } from "@/components/employer/subscription/subscription-buy";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth";
import { SITE } from "@/lib/content/site";
import { getDb, schema } from "@/lib/db";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { employerSubscription } from "@/lib/subscription/entitlement-db";
import { formatDate, formatMoney } from "@/lib/format";
import { getEmployerSubscriptionConfig } from "@/lib/platform-settings";
import { subscriptionChargeMinor } from "@/lib/employer-subscription";
import { subscriptionCurrency } from "@/lib/subscription/order";
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
  const charge = subscriptionChargeMinor(config, currency);
  const view = statusView(state);

  return (
    <div>
      <PageHeader title="Findtern Pro" subtitle="Filter candidates by CGPA and by college." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
        <Surface as="section" className="p-5 sm:p-8" aria-labelledby="plan-title">
          <h2 id="plan-title" className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
            The plan
          </h2>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="nums text-3xl font-semibold tracking-tight text-ink-900">{formatMoney(charge.baseMinor, currency)}</span>
            <span className="text-sm text-text-subtle">
              {charge.gstMinor > 0 ? `+ 18% GST (${formatMoney(charge.totalMinor, currency)} in total)` : "no GST"} · {config.durationDays} days of access
            </span>
          </p>

          <h3 className="mt-6 text-sm font-semibold text-ink-900">What it unlocks on Candidates</h3>
          <ul className="mt-3 space-y-3">
            {UNLOCKS.map((u) => (
              <li key={u} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/70">
                  <Check className="size-3" aria-hidden />
                </span>
                <span className="min-w-0 text-sm text-ink-700">
                  <span className="font-medium text-ink-900">{u}</span>
                  <span className="block text-text-subtle">{UNLOCK_COPY[u]}</span>
                </span>
              </li>
            ))}
          </ul>

          <div id="buy" className="mt-8 scroll-mt-24 border-t border-ink-100 pt-6">
            <h3 className="mb-4 text-sm font-semibold text-ink-900">{config.enabled ? buyLabel(state) : "Not on sale"}</h3>
            {config.enabled ? (
              <SubscriptionBuy
                employerId={employerId}
                currency={currency}
                charge={charge}
                durationDays={config.durationDays}
                renewing={state.active}
                note={renewalNote(state, config.durationDays)}
                prefill={{ name: employer.companyName, email: employer.companyEmail, contact: employer.phoneNumber ? `${employer.countryCode ?? ""}${employer.phoneNumber}` : undefined }}
              />
            ) : (
              <div role="status" className="rounded-apple-md bg-ink-50 p-4 text-sm leading-relaxed text-ink-700">
                <p className="font-medium text-ink-900">Findtern Pro is not on sale right now.</p>
                <p className="mt-1">There is nothing to buy at the moment. Write to {SITE.adminEmail} if you would like it switched on for your company.</p>
              </div>
            )}
          </div>
        </Surface>

        <aside className="min-w-0 space-y-4 max-xl:order-first xl:sticky xl:top-24 xl:self-start" aria-label="Your subscription">
          <Surface className="p-5">
            <SectionHead title="Your subscription" />
            <p className="flex flex-wrap items-center gap-2">
              <Pill tone={view.tone} size="md" icon={<span aria-hidden className="size-1.5 rounded-full bg-current" />}>
                {view.label}
              </Pill>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">{statusLine(state)}</p>
            {state.endsAt ? (
              <dl className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                <DetailRow label={state.active ? "Access until (India time)" : "Ended on (India time)"} value={formatDate(state.endsAt)} mono />
                {state.active && state.daysLeft !== null ? <DetailRow label="Days left" value={state.daysLeft} mono /> : null}
              </dl>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-3 text-sm">
              {config.enabled ? (
                <a href="#buy" className="inline-flex min-h-11 items-center rounded-sm font-medium text-brand-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring xl:hidden">
                  {buyLabel(state)}
                </a>
              ) : null}
              <Link href="/employer/orders" className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-medium text-brand-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <Receipt className="size-4" aria-hidden />
                Invoices under Orders
              </Link>
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  );
}
