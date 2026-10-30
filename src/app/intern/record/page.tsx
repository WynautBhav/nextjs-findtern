import type { Metadata } from "next";
import Link from "next/link";
import { EmptyScene, PageHead, Surface } from "@/components/app/primitives";
import { RecordExport } from "@/components/app/proof";
import { RecordCertificate, RecordTimeline } from "@/components/intern/record/record-certificate";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { loadInternData } from "@/lib/intern-data";
import { companyIn, recordAsText, recordTotals, roleOf } from "@/lib/journey";

/** Newest entries shown before "Show older"; the download always has all of them. */
const FIRST_PAGE = 10;

export const metadata: Metadata = {
  title: "Your record",
  description: "Everything you have done on Findtern, dated and exportable.",
  robots: { index: false, follow: false },
};

/**
 * The record.
 *
 * This is the screen the product exists to produce, and it is the reason the
 * rest of the experience is worth anything: a candidate who completes an
 * internship here should leave with something they can show, not a feeling
 * they had.
 *
 * ── Why it looks like a certificate but is not one ──────────────────────
 *
 * The industry is full of certificates that attest a student watched a video.
 * Those are noise, and employers have learned to discount them, so a badge
 * that says "you did some clicking" would actively waste the one asset this
 * screen is trying to build. The seal and the layout borrow a certificate's
 * gravity; the content does not borrow its emptiness. Everything here is drawn from a row a person or
 * a payment created: hours a manager approved, money that reached an account,
 * an interview that actually happened, a score that was actually published.
 *
 * ── Why export is the primary action ────────────────────────────────────
 *
 * Because the value of a record is realised outside the product. Nobody hires
 * from a dashboard. A student needs a file they can attach to an application,
 * paste into a message to a mentor, or show in an interview, and the moment
 * that happens the product has done its job. Export is the point, so it is
 * the button, and it is the first thing on the page.
 *
 * The export is a plain text file on purpose. A PDF would look more
 * impressive and would be harder to paste into anything. A text file reads as
 * a record rather than as a product screenshot, and it opens anywhere.
 */
export default async function InternRecord({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const session = await requireRole("intern");
  const showAll = (await searchParams).all === "1";

  const data = await loadInternData(session.uid);
  const { getDb, schema } = await import("@/lib/db");
  const { eq } = await import("drizzle-orm");
  const [user] = await getDb()
    .select({ first: schema.users.firstName, last: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  const candidate = `${user?.first ?? ""} ${user?.last ?? ""}`.trim() || "Candidate";
  const exportText = recordAsText(data.proofs, candidate);
  const totals = recordTotals(data.proofs);
  const job = data.engagement;
  const internship = job ? `${roleOf(job.offerDetails ?? {})} at ${companyIn(data.names[job.employerId])}` : undefined;
  const shown = showAll ? data.proofs : data.proofs.slice(0, FIRST_PAGE);
  const older = data.proofs.length - shown.length;

  return (
    <div>
      <PageHead
        title="Your record"
        lede="Dated, and confirmed by a person or a payment. Download it as a plain text file to attach anywhere."
        action={
          data.proofs.length > 0 ? (
            <RecordExport
              className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto"
              filename={`findtern-record-${candidate.toLowerCase().replace(/\s+/g, "-")}.txt`}
              text={exportText}
            />
          ) : null
        }
      />

      {data.proofs.length === 0 ? (
        <EmptyScene
          art
          title="Nothing on your record yet"
          body="The first item appears the moment something real happens to you here: an interview you complete, hours a manager approves, or a stipend that reaches your account. Nothing is added for logging in."
          next={{ label: "See what is waiting", href: "/intern/dashboard" }}
        />
      ) : (
        <div className="space-y-4 lg:space-y-6">
          <RecordCertificate name={candidate} internship={internship} asOf={new Date()} totals={totals} />
          <Surface className="p-5 sm:p-8">
            <RecordTimeline proofs={shown} />
            {older > 0 ? (
              <div className="mt-6 border-t border-ink-100 pt-5 pl-14 sm:pl-15">
                <Link href="/intern/record?all=1" scroll={false} className={buttonClass({ variant: "outline", size: "sm" })}>
                  Show {older} older {older === 1 ? "item" : "items"}
                </Link>
              </div>
            ) : null}
          </Surface>
        </div>
      )}
    </div>
  );
}
