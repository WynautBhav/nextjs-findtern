import type { Metadata } from "next";
import { EmptyScene, PageHead, Pill, SectionHead, Surface } from "@/components/app/primitives";
import { FreshProofGrid, RecordCount, RecordExport } from "@/components/app/proof";
import { Thread } from "@/components/app/thread";
import { CountUp } from "@/components/app/count-up";
import { requireRole } from "@/lib/auth";
import { loadInternData } from "@/lib/intern-data";
import { recordAsText } from "@/lib/journey";

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
 * ── Why this is not a certificate ──────────────────────────────────────
 *
 * The industry is full of certificates that attest a student watched a video.
 * Those are noise, and employers have learned to discount them, so a badge
 * that says "you did some clicking" would actively waste the one asset this
 * screen is trying to build. Everything here is drawn from a row a person or
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
export default async function InternRecord() {
  const session = await requireRole("intern");

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

  const hoursTotal = data.proofs
    .filter((p) => p.kind === "hours")
    .reduce((sum, p) => {
      const fact = p.facts.find((f) => f.label === "Hours");
      const n = fact ? Number(fact.value) : 0;
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

  const paidTotal = data.proofs
    .filter((p) => p.kind === "stipend")
    .reduce((sum, p) => {
      const fact = p.facts.find((f) => f.label === "Amount");
      const n = fact ? Number(fact.value.replace(/[^\d.]/g, "")) : 0;
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

  return (
    <div>
      <PageHead
        title="Your record"
        lede="Everything you have done here, with the date it happened and who confirmed it. Take it with you."
        action={<RecordExport filename={`findtern-record-${candidate.toLowerCase().replace(/\s+/g, "-")}.txt`} text={exportText} />}
      />

      {/* ── The three numbers that matter ───────────────────────────
          Not four identical stat cards. Each one answers a question a
          candidate actually has: how much work, how much money, how many
          people vouch for me. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Figure label="Hours a manager approved" value={hoursTotal} unit="hours" />
        <Figure label="Stipend paid to you" value={paidTotal} unit="rupees" money />
        <Figure label="Times someone vouched" value={data.proofs.length} unit="records" />
      </div>

      {data.proofs.length === 0 ? (
        <EmptyScene
          art
          title="Nothing on your record yet"
          body="The first item appears the moment something real happens to you here: an interview you complete, hours a manager approves, or a stipend that reaches your account. Nothing is added for logging in."
          next={{ label: "See what is waiting", href: "/intern/dashboard" }}
        />
      ) : (
        <>
          <RecordCount proofs={data.proofs} />
          <div className="mt-6">
            {/* The proof cards are h3s; this keeps the outline h1 > h2 > h3. */}
            <h2 className="sr-only">Your records</h2>
            <FreshProofGrid proofs={data.proofs} />
          </div>
        </>
      )}

      {/* ── The full history ────────────────────────────────────── */}
      {data.thread.length > 0 ? (
        <section className="mt-12 border-t border-ink-100 pt-8">
          <SectionHead
            title="Everything that has happened"
            hint="Including the parts that are still in progress."
          />
          <Thread nodes={data.thread} />
        </section>
      ) : null}

      {/* ── What is not here, and why ───────────────────────────────
          Stating the omissions is more honest than letting someone assume the
          record is a complete evaluation of them. */}
      <section className="mt-12 border-t border-ink-100 pt-8">
        <SectionHead title="What this record is not" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "It is not a certificate. Nobody here is issuing you a qualification you have not earned.",
            "It does not rank you. There is no leaderboard and no position against other candidates.",
            "It does not count logins. Opening this app does not add anything to it.",
            "It does not expire. Nothing here is taken away for taking a week off.",
          ].map((line) => (
            <li key={line} className="flex gap-2.5 text-pretty text-sm leading-relaxed text-ink-600">
              <Pill tone="neutral" className="mt-0.5 h-fit shrink-0">
                No
              </Pill>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * One figure. Large number, unit underneath, one line saying what it counts.
 *
 * Built as a definition list rather than three identical cards with an icon and
 * a grey sentence, because the number is the content and the label is the
 * caption. Tabular numerals so a column of them lines up.
 */
function Figure({
  label,
  value,
  unit,
  money,
}: {
  label: string;
  value: number;
  unit: string;
  money?: boolean;
}) {
  return (
    <Surface className="p-5">
      <p className="text-balance text-sm leading-snug text-ink-600">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-3xl font-semibold tabular-nums tracking-[-0.025em] text-ink-900">
          <CountUp value={value} currency={money ? "INR" : undefined} />
        </span>
        <span className="text-sm text-ink-600">{unit}</span>
      </p>
    </Surface>
  );
}

