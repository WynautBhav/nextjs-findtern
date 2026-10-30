import type { Metadata } from "next";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { ExternalLink, FileImage, FileText, Upload, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { Tile } from "@/components/app/tiles";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { formatDmy } from "@/lib/format";
import { DocImagePreview } from "@/components/intern/doc-preview";
import { certificateFiles } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Documents",
  robots: { index: false, follow: false },
};

/* Read-only. "View" links go through /intern/documents/open, which checks
 * ownership and mints a fresh signed URL per click, so links never go stale.
 * Replacement uploads happen in the onboarding form.
 */

type DocumentRow = {
  id: string;
  href: string;
  /** Stored file name or key, when it differs from the label shown. */
  key?: string;
  label: string;
  fileName: string;
  contentType: string | null;
  size: number | null;
  stampedAt: Date | null;
};

export default async function InternDocuments() {
  const session = await requireRole("intern");
  // No try/catch: a failed read shows the error state (app/intern/error.tsx),
  // never "No documents uploaded".
  const db = getDb();
  const [record] = await db
    .select()
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, session.uid))
    .orderBy(desc(schema.internDocuments.createdAt))
    .limit(1);

  let rows: DocumentRow[] = record ? flattenRecord(record) : [];
  const [onboarding] = await db
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, session.uid))
    .limit(1);
  const academics = ((onboarding?.extra ?? {}) as Record<string, unknown>).academics as Record<string, unknown> | undefined;
  const sheets = Array.isArray(academics?.marksheetUploads) ? (academics.marksheetUploads as Record<string, unknown>[]) : [];
  sheets.forEach((m, i) => {
    const name = String(m.name ?? "");
    if (!name) return;
    rows.push({
      id: `marksheet-${i}`,
      href: "",
      label: "Marksheet",
      // Legacy stores `originalName`; older rows from this app used `label`.
      fileName: String(m.originalName || m.label || name.split("/").pop()),
      contentType: typeof m.type === "string" ? m.type : null,
      size: typeof m.size === "number" ? m.size : null,
      stampedAt: null,
      key: name,
    });
  });
  certificateFiles(academics).forEach((c, i) => {
    rows.push({
      id: `certificate-${i}`,
      href: "",
      label: c.label,
      fileName: c.originalName || c.name.split("/").pop() || c.name,
      contentType: c.type || null,
      size: c.size || null,
      stampedAt: null,
      key: c.name,
    });
  });
  rows = rows.map((r) => ({ ...r, href: `/intern/documents/open?key=${encodeURIComponent(r.key ?? r.fileName)}` }));

  return (
    <div>
      <PageHead
        title="Documents"
        lede="The files attached to your profile. Only you and the Findtern team can open them."
        action={
          rows.length > 0 ? (
            <ButtonLink href="/intern/onboarding" variant="outline">
              <Upload className="size-4" aria-hidden />
              Replace or add files
            </ButtonLink>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="No documents uploaded yet"
          body="Your profile photo, Aadhaar, PAN and marksheets appear here once you add them in the profile editor."
          next={{ label: "Add them in your profile", href: "/intern/onboarding" }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* What the files are for, in the order they matter: being paid, then the profile, then education. */}
          {GROUPS.map((g) => {
            const docs = rows.filter((r) => g.has(r.label));
            if (docs.length === 0 && g.title !== "For your stipend") return null;
            const pan = rows.some((r) => r.label === "PAN");
            return (
              <Tile
                key={g.title}
                title={g.title}
                className={g.wide ? "lg:col-span-2" : undefined}
                aside={g.title === "For your stipend" ? <Pill tone={pan ? "paid" : "waiting"}>{pan ? "PAN on file" : "PAN missing"}</Pill> : null}
                description={
                  g.title !== "For your stipend" ? undefined : pan ? (
                    "Your PAN image is what payouts need, so your stipend can go out. Employers never see these files."
                  ) : (
                    <>
                      Payouts need your PAN image.{" "}
                      <Link href="/intern/onboarding" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
                        Add it in your profile
                      </Link>{" "}
                      so your stipend can go out.
                    </>
                  )
                }
              >
                {docs.length > 0 ? (
                  <ul className={cn("grid gap-4", g.wide ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "grid-cols-2")}>
                    {docs.map((doc) => (
                      <DocCard key={doc.id} doc={doc} />
                    ))}
                  </ul>
                ) : null}
              </Tile>
            );
          })}
        </div>
      )}
    </div>
  );
}

const GROUPS: { title: string; wide?: boolean; has: (label: string) => boolean }[] = [
  { title: "For your stipend", has: (l) => l === "Aadhaar" || l === "PAN" },
  { title: "Your profile", has: (l) => l === "Profile photo" || l === "Intro video" },
  { title: "Education and certificates", wide: true, has: (l) => !["Aadhaar", "PAN", "Profile photo", "Intro video"].includes(l) },
];

/** One file as itself: the image or the video's first frame, large enough to recognise. */
function DocCard({ doc }: { doc: DocumentRow }) {
  const type = (doc.contentType ?? "").toLowerCase();
  return (
    <li className="group relative min-w-0">
      <span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-apple-md bg-ink-50 text-text-subtle ring-1 ring-inset ring-ink-200/70 apple-spring group-hover:ring-brand-400">
        {type.startsWith("image/") ? (
          <DocImagePreview href={doc.href} fit={doc.label === "Profile photo" ? "cover" : "contain"} />
        ) : type.startsWith("video/") ? (
          <video muted preload="metadata" src={doc.href} className="size-full object-cover" aria-hidden />
        ) : (
          <span className="flex flex-col items-center gap-2 text-xs">
            <DocIcon contentType={doc.contentType} />
            {kindLabel(doc.contentType)}
          </span>
        )}
      </span>
      <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-ink-900">
        <a
          href={doc.href}
          target="_blank"
          rel="noreferrer"
          className="truncate rounded-apple-sm hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 after:absolute after:inset-0"
        >
          {doc.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <ExternalLink className="size-3.5 shrink-0 text-text-subtle" aria-hidden />
      </p>
      <p className="nums mt-0.5 text-xs text-text-subtle [overflow-wrap:anywhere]">
        {doc.fileName} · {formatBytes(doc.size)}
        {doc.stampedAt ? ` · ${formatDmy(doc.stampedAt)}` : ""}
      </p>
    </li>
  );
}

/** A stored record groups up to four files under one row; present them as a list. */
function flattenRecord(record: typeof schema.internDocuments.$inferSelect): DocumentRow[] {
  const slots = [
    { label: "Profile photo", name: record.profilePhotoName, type: record.profilePhotoType, size: record.profilePhotoSize },
    { label: "Intro video", name: record.introVideoName, type: record.introVideoType, size: record.introVideoSize },
    { label: "Aadhaar", name: record.aadhaarImageName, type: record.aadhaarImageType, size: record.aadhaarImageSize },
    { label: "PAN", name: record.panImageName, type: record.panImageType, size: record.panImageSize },
  ];

  return slots
    .filter((slot): slot is { label: string; name: string; type: string | null; size: number | null } =>
      Boolean(slot.name),
    )
    .map((slot, i) => ({
      id: `${record.id}-${i}`,
      href: "",
      label: slot.label,
      // Identity slots keep only a storage key, not the original name.
      fileName: kindLabel(slot.type),
      key: slot.name,
      contentType: slot.type,
      size: slot.size,
      stampedAt: record.updatedAt ?? record.createdAt ?? null,
    }));
}

function kindLabel(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("image/")) return `${t.slice(6).toUpperCase()} image`;
  if (t.startsWith("video/")) return "Video";
  if (t === "application/pdf") return "PDF";
  return "File";
}

function DocIcon({ contentType }: { contentType: string | null }) {
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("video/")) return <Video className="size-5" aria-hidden />;
  if (type.startsWith("image/")) return <FileImage className="size-5" aria-hidden />;
  return <FileText className="size-5" aria-hidden />;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
