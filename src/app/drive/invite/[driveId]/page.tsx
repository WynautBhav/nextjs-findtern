import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";

import { inviteSigOk, invitePath, isInvited } from "@/lib/college/drive-invite";
import { driveCodeSecret } from "@/lib/drives/code-derive";
import { getDb, schema } from "@/lib/db";

import { DriveLanding, driveLandingMetadata } from "../../drive-landing";

export const metadata = driveLandingMetadata;

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Where the invite email leads (lib/college/drive-invite.ts). The address and signature in the query must match the
 * drive and still be on its invited list. A company with an employer account is asked to sign in and a new one to
 * register (details filled in); either way they come back here and enter. 404 for anything that does not verify.
 */
export default async function DriveInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ driveId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ driveId }, sp] = await Promise.all([params, searchParams]);
  const email = one(sp.e).trim().toLowerCase();
  const sig = one(sp.s);
  if (!/^[0-9a-f-]{36}$/i.test(driveId) || !email || email.length > 200 || sig.length < 20 || sig.length > 100) notFound();

  let loaded;
  try {
    const db = getDb();
    const [row] = await db
      .select({ drive: schema.collegeDrives, college: schema.colleges })
      .from(schema.collegeDrives)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where(eq(schema.collegeDrives.id, driveId))
      .limit(1);
    if (!row || !row.college.isActive) notFound();
    if (!isInvited(row.drive.invitedEmployers, email) || !inviteSigOk(driveCodeSecret(), row.drive.id, row.drive.tokenHash, email, sig)) notFound();
    const [account] = await db.select({ id: schema.employers.id }).from(schema.employers).where(eq(sql`lower(${schema.employers.companyEmail})`, email)).limit(1);
    loaded = { ...row, hasAccount: Boolean(account) };
  } catch (err) {
    // notFound() throws a control-flow error: let it through, report anything else.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[drive invite]", err);
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">We couldn&apos;t open this drive just now</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-600">Nothing is wrong with your link. Try again in a moment.</p>
      </main>
    );
  }
  const company = (loaded.drive.invitedEmployers ?? []).find((i) => i.email.trim().toLowerCase() === email)?.company ?? "your company";
  return (
    <DriveLanding
      drive={loaded.drive}
      college={loaded.college}
      entry={{ kind: "invite", credential: { driveId, email, sig }, here: invitePath(driveId, email, sig), company, email, hasAccount: loaded.hasAccount }}
    />
  );
}
