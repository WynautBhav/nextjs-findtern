import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { hashDriveToken } from "@/lib/college/tokens";
import { getDb, schema } from "@/lib/db";

import { DriveLanding, driveLandingMetadata } from "../drive-landing";

export const metadata = driveLandingMetadata;

export const dynamic = "force-dynamic";

export default async function DriveLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 20 || token.length > 100) notFound();

  // A database hiccup says so instead of a 500 page (the link is shared
  // with outside companies, often opened once).
  let row: { drive: typeof schema.collegeDrives.$inferSelect; college: typeof schema.colleges.$inferSelect } | undefined;
  try {
    [row] = await getDb()
      .select({ drive: schema.collegeDrives, college: schema.colleges })
      .from(schema.collegeDrives)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where(eq(schema.collegeDrives.tokenHash, hashDriveToken(token)))
      .limit(1);
  } catch (err) {
    console.error("[drive landing]", err);
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">We couldn&apos;t open this drive just now</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-600">Nothing is wrong with your link. Try again in a moment.</p>
      </main>
    );
  }
  if (!row || !row.college.isActive) notFound();
  return <DriveLanding drive={row.drive} college={row.college} entry={{ kind: "token", token, here: `/drive/${token}` }} />;
}
